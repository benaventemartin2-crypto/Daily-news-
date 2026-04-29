import 'dotenv/config';
import { fetchNews } from './fetchNews.js';
import { filterNews, pickTop } from './filterNews.js';
import { summarizeBriefing } from './summarizeBriefing.js';
import { sendEmail } from './sendEmail.js';

function formatChileDate(tz = 'America/Santiago') {
  const fmt = new Intl.DateTimeFormat('es-CL', {
    timeZone: tz,
    day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
  });
  return fmt.format(new Date());
}

// Resuelve qué API key usar según el provider configurado.
function resolveApiKey(provider) {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  if (provider === 'groq')   return process.env.GROQ_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function autoDetectProvider() {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER.toLowerCase();
  if (process.env.GROQ_API_KEY)   return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
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
    maxToModel: parseInt(process.env.MAX_NEWS_TO_MODEL || '40', 10),
    lang:       process.env.BRIEFING_LANG || 'es',
    tz:         process.env.TIMEZONE || 'America/Santiago',
    dryRun:     String(process.env.DRY_RUN || '').toLowerCase() === 'true',
  };

  console.log('==============================================');
  console.log(' Daily News Briefing');
  console.log(` Provider: ${cfg.provider} | DryRun: ${cfg.dryRun}`);
  console.log('==============================================');

  // 1) Recolectar
  const raw = await fetchNews({ newsApiKey: cfg.newsApiKey });

  // 2) Filtrar determinísticamente
  const filtered = filterNews(raw);
  const picked = pickTop(filtered, { maxToModel: cfg.maxToModel });

  // 3) Resumir con IA
  const briefing = await summarizeBriefing(picked, {
    apiKey:   cfg.aiKey,
    model:    cfg.aiModel,
    provider: cfg.provider,
    lang:     cfg.lang,
  });

  console.log('\n----- BRIEFING -----\n');
  console.log(briefing);
  console.log('\n--------------------\n');

  // 4) Enviar mail
  const subject = `Briefing diario — Noticias clave — ${formatChileDate(cfg.tz)}`;

  if (cfg.dryRun) {
    console.log(`[main] DRY_RUN=true — no se envía mail. Asunto sería: "${subject}"`);
  } else {
    await sendEmail({
      user:        cfg.gmailUser,
      appPassword: cfg.gmailPass,
      to:          cfg.emailTo,
      subject,
      markdown:    briefing,
    });
  }

  console.log(`[main] Listo en ${(Date.now() - t0) / 1000}s`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
