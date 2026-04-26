import OpenAI from 'openai';

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

export async function summarizeBriefing(items, { apiKey, model = 'gpt-4o-mini', lang = 'es' }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada.');
  if (!items.length) {
    return '_No se obtuvieron noticias en las últimas 24h._';
  }

  const client = new OpenAI({ apiKey });
  const userPrompt = buildUserPrompt(items, lang);

  console.log(`[summarize] Llamando a OpenAI (${model}) con ${items.length} noticias...`);
  const t0 = Date.now();

  const response = await client.chat.completions.create({
    model,
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
