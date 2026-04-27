import OpenAI from 'openai';

// Providers con API compatible con OpenAI SDK.
const PROVIDERS = {
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash-lite',
    envKey: 'GEMINI_API_KEY',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
  openai: {
    baseURL: null,
    defaultModel: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
};

const SYSTEM_PROMPT = `Eres un editor ejecutivo que produce un briefing diario de noticias en español.
Audiencia: profesional ocupado que NO quiere leer diarios completos.
Reglas estrictas:
- Solo hechos relevantes y verificables presentes en las noticias entregadas. No inventes.
- Excluir farándula, deportes, crónica roja, opinión, regulación chilena.
- Eliminar duplicados y agrupar noticias del mismo evento.
- Tono: directo, neutral, sin adjetivación, sin clickbait.
- Idioma: español neutro.
- Largo final: 400-600 palabras totales.`;

function buildUserPrompt(items, lang) {
  const lines = items.map((it, idx) => {
    const desc = (it.description || '').replace(/\s+/g, ' ').slice(0, 280);
    return `${idx + 1}. [${it.region}] (${it.source}) ${it.title}${desc ? ` — ${desc}` : ''}`;
  });

  return `Noticias prefiltradas de las últimas ~24h (${items.length} items):

${lines.join('\n')}

Genera un briefing siguiendo EXACTAMENTE este formato Markdown.
Idioma: ${lang}.

🌍 INTERNACIONAL
(máximo 5 noticias, prioriza geopolítica, economía global, tecnología, IA, startups, big tech, empresas grandes, mercados financieros)
- **Título**
  - Qué pasó: ...
  - Por qué importa: ...

🇨🇱 CHILE
(máximo 5 noticias, solo economía chilena, negocios, empresas chilenas — NO regulación chilena)
- **Título**
  - Qué pasó: ...
  - Por qué importa: ...

📊 ECONOMÍA Y MERCADOS
(3-4 insights relevantes, en bullets cortos)

🧠 INSIGHT DEL DÍA
(una sola tendencia transversal y su implicancia, 2-3 frases)

🚀 OPORTUNIDAD / RIESGO
- Oportunidad: una concreta, accionable.
- Riesgo: uno relevante, accionable.

Total: 400-600 palabras. No agregues introducción, conclusión, ni encabezados extra.
Si una sección no tiene material suficiente en las noticias entregadas, ponla con menos items en lugar de inventar.`;
}

export async function summarizeBriefing(items, { apiKey, model, provider = 'gemini', lang = 'es' }) {
  if (!items.length) return '_No se obtuvieron noticias en las últimas 24h._';

  const providerCfg = PROVIDERS[provider] ?? PROVIDERS.gemini;
  const resolvedModel = model || providerCfg.defaultModel;

  if (!apiKey) {
    throw new Error(
      `Falta la API key para el provider "${provider}". Configura el secret ${providerCfg.envKey}.`
    );
  }

  const clientOpts = { apiKey };
  if (providerCfg.baseURL) clientOpts.baseURL = providerCfg.baseURL;
  const client = new OpenAI(clientOpts);

  const userPrompt = buildUserPrompt(items, lang);
  console.log(`[summarize] Provider: ${provider} | Modelo: ${resolvedModel} | Items: ${items.length}`);
  const t0 = Date.now();

  const response = await client.chat.completions.create({
    model: resolvedModel,
    temperature: 0.2,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
  });

  const text = response.choices?.[0]?.message?.content?.trim() || '';
  const usage = response.usage || {};
  console.log(`[summarize]   ok en ${Date.now() - t0}ms — tokens: prompt=${usage.prompt_tokens ?? '?'} comp=${usage.completion_tokens ?? '?'}`);
  return text;
}
