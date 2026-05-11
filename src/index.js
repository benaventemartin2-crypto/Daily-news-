import 'dotenv/config';
import { fetchNews } from './fetchNews.js';
import { filterNews, pickTop } from './filterNews.js';
import { fetchMarketData, renderMarketForPrompt } from './fetchMarketData.js';
import { summarizeBriefing } from './summarizeBriefing.js';
import { sendEmail } from './sendEmail.js';
import {
  loadMemory, saveMemory, appendDay,
  extractTopicsFromPicked, renderMemoryForPrompt, extractDailySummary,
} from './memory.js';

function formatChileDate(tz = 'America/Santiago') {
  const fmt = new Intl.DateTimeFormat('es-CL', {
    timeZone: tz,
    day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
  });
  return fmt.format(new Date());
}

function isoChileDate(tz = 'America/Santiago') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

function resolveApiKey(provider) {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  if (provider === 'groq')   return process.env.GROQ_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function autoDetectProvider() {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER.toLowerCase();
  // Preferimos Gemini sobre Groq porque tiene mejor manejo de outputs largos
  // (el briefing nuevo apunta a 1.200-1.800 palabras) y cuotas más generosas.
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY)   return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'gemini';
}

async function main() {
  const t0 = Date.now();

  const provider  = autoDetectProvider();
  const cfg = {
    aiKey:      resolveApiKey(provider),
    aiModel:    process.env.AI_MODEL || '',
    provider,
    newsApiKey: process.env.NEWS_API_KEY || '',
    gmailUser:  process.env.GMAIL_USER,
    gmailPass:  process.env.GMAIL_APP_PASSWORD,
    emailTo:    process.env.EMAIL_TO || '',
    maxToModel: parseInt(process.env.MAX_NEWS_TO_MODEL || '60', 10),
    lang:       process.env.BRIEFING_LANG || 'es',
    tz:         process.env.TIMEZONE || 'America/Santiago',
    dryRun:     String(process.env.DRY_RUN || '').toLowerCase() === 'true',
    skipMarket: String(process.env.SKIP_MARKET || '').toLowerCase() === 'true',
    skipMemory: String(process.env.SKIP_MEMORY || '').toLowerCase() === 'true',
  };

  const dateLabel = formatChileDate(cfg.tz);
  const isoDate = isoChileDate(cfg.tz);

  console.log('==============================================');
  console.log(' Daily News Briefing');
  console.log(` Provider: ${cfg.provider} | DryRun: ${cfg.dryRun} | Fecha: ${dateLabel}`);
  console.log('==============================================');

  // 1) Recolectar noticias e indicadores en paralelo
  const [raw, marketData, memory] = await Promise.all([
    fetchNews({ newsApiKey: cfg.newsApiKey }),
    cfg.skipMarket ? Promise.resolve(null) : fetchMarketData(),
    cfg.skipMemory ? Promise.resolve({ history: [] }) : loadMemory(),
  ]);

  // 2) Filtrar y seleccionar
  const filtered = filterNews(raw);
  const picked = pickTop(filtered, { maxToModel: cfg.maxToModel });

  // 3) Renderizar contexto para el modelo
  const marketBlock = marketData ? renderMarketForPrompt(marketData) : '';
  const memoryBlock = renderMemoryForPrompt(memory);

  // 4) Generar briefing
  const briefing = await summarizeBriefing(picked, {
    apiKey:   cfg.aiKey,
    model:    cfg.aiModel,
    provider: cfg.provider,
    lang:     cfg.lang,
    marketBlock,
    memoryBlock,
    dateLabel,
  });

  console.log('\n----- BRIEFING -----\n');
  console.log(briefing);
  console.log('\n--------------------\n');

  // 5) Persistir memoria (lo intentamos siempre que el briefing tenga contenido)
  if (!cfg.skipMemory && briefing && briefing.length > 200) {
    const headlines = extractTopicsFromPicked(picked);
    const summary = extractDailySummary(briefing);
    const updated = appendDay(memory, { date: isoDate, headlines, summary });
    await saveMemory(updated);
  }

  // 6) Enviar mail
  const subject = `Briefing diario — ${dateLabel}`;

  if (cfg.dryRun) {
    console.log(`[main] DRY_RUN=true — no se envía mail. Asunto sería: "${subject}"`);
  } else {
    await sendEmail({
      user:        cfg.gmailUser,
      appPassword: cfg.gmailPass,
      to:          cfg.emailTo,
      subject,
      markdown:    briefing,
      dateLabel,
    });
  }

  console.log(`[main] Listo en ${(Date.now() - t0) / 1000}s`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
