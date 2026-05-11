import OpenAI from 'openai';

const PROVIDERS = {
  gemini: {
    // Usamos gemini-2.0-flash como default: rápido, output limpio, sin "thinking
    // mode" que en 2.5-flash puede dejar el campo content vacío al consumir
    // todos los tokens en thinking interno. Para forzar 2.5-flash o pro, setear
    // la variable AI_MODEL.
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
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

const SYSTEM_PROMPT = `Eres el editor de un briefing diario en español dirigido a un profesional ocupado en Chile.
Tu trabajo es reemplazar la lectura matinal de Diario Financiero, Bloomberg y un par de portales internacionales.

Tono y estilo:
- Claro, ejecutivo, inteligente. Mezcla entre Diario Financiero, Bloomberg y un explicador inteligente.
- Párrafos bien escritos. Evita listas con bullets en las noticias principales.
- Nada de relleno, ni frases tipo "Esto es importante porque...", "En resumen...", "Cabe destacar...", "En el contexto actual...".
- No uses emojis dentro del texto. Sólo se permiten en los encabezados de sección si así te lo indica el formato.
- No te presentes ni cierres con frases conversacionales. Esto es un producto editorial, no un chat.

Reglas duras de contenido:
- Solo hechos presentes en las noticias o indicadores entregados. NUNCA inventes datos, cifras, fechas, declaraciones ni resultados.
- Si un dato no está disponible, dilo explícitamente ("dato no disponible", "no se reporta cifra"). Mejor decir que falta información que inventarla.
- Excluye farándula, deportes, crónica roja y opinión.
- Integra el contexto dentro del cuerpo de cada noticia. NO uses una sección separada de "por qué importa".
- Conecta las noticias con temas recurrentes cuando sea natural (inflación, tasas, dólar, cobre, China, EE.UU., situación fiscal chilena, seguridad, IA).
- Usa la memoria de días previos cuando aporte continuidad ("se suma a la semana marcada por...", "sigue la línea de ayer con...").

Idioma: español neutro chileno.`;

function buildNewsBlock(items) {
  return items.map((it, idx) => {
    const desc = (it.description || '').replace(/\s+/g, ' ').slice(0, 320);
    const tags = it.tags?.length ? ` {${it.tags.join(',')}}` : '';
    return `${idx + 1}. [${it.region}${tags}] (${it.source}) ${it.title}${desc ? ` — ${desc}` : ''}`;
  }).join('\n');
}

function buildUserPrompt({ items, marketBlock, memoryBlock, dateLabel }) {
  const memSection = memoryBlock
    ? `\n\n--- MEMORIA DE DÍAS PREVIOS (úsala sólo si aporta continuidad real, no la cites textualmente) ---\n${memoryBlock}\n`
    : '';

  return `Fecha del briefing: ${dateLabel}.

--- INDICADORES DE MERCADO (datos reales recolectados de mindicador.cl y stooq.com) ---
Usa SOLO estos números. No los modifiques. Si un indicador dice "no disponible", repítelo como tal.
${marketBlock || '(sin datos de mercado disponibles hoy)'}

--- NOTICIAS PREFILTRADAS (últimas ~24-36h, ${items.length} items) ---
${buildNewsBlock(items)}${memSection}

--- INSTRUCCIONES DE FORMATO ---
Genera el briefing en Markdown extendido. Usa EXACTAMENTE esta estructura, en este orden, sin secciones adicionales:

# Briefing diario — ${dateLabel}

## 1. Resumen ejecutivo
Un párrafo único de 5 a 8 líneas. Apertura editorial, no lista. Debe responder, integrado en prosa: qué pasa hoy en el mundo, qué pasa en Chile, qué están mirando los mercados y qué tema conviene seguir durante el día. Tono de columna inteligente.

## 2. Mundo
Entre 3 y 5 noticias internacionales relevantes. Para cada una:
### Título de la noticia
Un párrafo de 6 a 10 líneas con el hecho, el contexto suficiente para entenderlo desde cero, y la conexión con economía, política o mercados cuando aplique. Cita la fuente entre paréntesis al final del párrafo, así: "(Reuters)" o "(BBC)". NO uses bullets dentro del párrafo.

## 3. Chile
Entre 3 y 5 noticias relevantes de Chile (política, economía, seguridad, regulación, empresas grandes o temas país). Mismo formato: título como ### encabezado, párrafo de 6 a 10 líneas con contexto integrado y fuente entre paréntesis al cierre.

## 4. Economía y mercados
Primero, el bloque de indicadores. RESPETA EXACTAMENTE este formato linea por linea, una línea por indicador, usando los valores de la sección de INDICADORES de arriba (incluye sólo los disponibles, omite los "no disponible" si quieres simplificar pero menciona explícitamente cuáles faltan):

INDICATOR|<nombre>|<valor con unidad y variación>|<fecha>|<contexto en una línea>|<fuente>

Ejemplo:
INDICATOR|Dólar observado|945,30 CLP (+0,42%)|2026-05-09|Tipo de cambio del Banco Central|mindicador.cl

Después del bloque INDICATOR, escribe 2 a 3 párrafos cortos interpretando lo que muestran los indicadores en conjunto y conectándolos con las noticias del día.

## 5. Empresas y negocios
Entre 3 y 5 noticias relevantes (bancos, retail, minería, energía, tecnología, startups, fusiones, resultados). Para cada una: ### título y párrafo de 6 a 10 líneas que explique qué pasó, qué significa, en qué contexto ocurre y qué puede indicar sobre el sector. Fuente entre paréntesis al cierre.

## 6. Tecnología e innovación
Entre 2 y 4 noticias (IA, software, chips, energía, autos eléctricos, ciberseguridad, big tech). Mismo formato: ### título y párrafo con contexto. Evita lanzamientos menores.

## 7. Tema de fondo del día
Elige UN tema importante del día y explícalo en profundidad. Extensión: 300 a 500 palabras. Debe servir para aprender y entender contexto acumulativo. Escribe como mini-columna explicativa, en prosa fluida, sin bullets. No empieces con "El tema de hoy es...". Empieza directo en el contenido.

## 8. Qué mirar
Entre 3 y 5 viñetas concretas para seguir durante el día o la semana. Aquí SÍ usa bullets cortos. Cada bullet es una señal accionable y específica (un dato que sale, una decisión, una votación, un resultado, un movimiento de mercado a vigilar). Nada genérico.

--- REGLAS FINALES ---
- Largo objetivo total: entre 1.200 y 1.800 palabras.
- No agregues introducción, despedida ni meta-comentarios.
- No incluyas la sección "Por qué esto es importante" ni "Oportunidades relevantes". Están eliminadas.
- Si una sección no tiene material suficiente, redúcela en lugar de inventar.
- Las únicas líneas que empiezan con "INDICATOR|" son las del bloque de indicadores en la sección 4. No uses esa sintaxis en otro lugar.`;
}

async function callWithRetry(fn) {
  // Estrategia agresiva: 429 (rate limit) suele ser cuota diaria o de minuto;
  // hacemos solo 1 retry corto y luego saltamos al siguiente provider.
  // 5xx sí amerita retry exponencial porque puede ser transitorio del servidor.
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status;
      if (status === 429) {
        if (attempt >= 1) throw err;
        console.warn(`[summarize] HTTP 429 (rate limit) — 1 retry rápido y luego fallback al siguiente provider`);
        await new Promise((r) => setTimeout(r, 3000));
      } else if (status >= 500 && status < 600) {
        if (attempt >= 2) throw err;
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(`[summarize] HTTP ${status} — retry en ${delay}ms (${attempt + 1}/2)`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
      attempt++;
    }
  }
}

// Tope de items enviados al modelo, por provider.
// Groq free tier topa en 12.000 TPM TOTAL (prompt + completion), así que
// recortamos fuerte el input para que quepa.
const ITEM_CAP_BY_PROVIDER = { gemini: 60, groq: 22, openai: 60 };

// Intenta generar el briefing con un provider específico.
async function tryOneProvider({ provider, apiKey, model, items, marketBlock, memoryBlock, dateLabel }) {
  const providerCfg = PROVIDERS[provider] ?? PROVIDERS.gemini;
  const resolvedModel = model || providerCfg.defaultModel;

  if (!apiKey) {
    throw new Error(`Falta la API key para el provider "${provider}" (env ${providerCfg.envKey}).`);
  }

  const itemCap = ITEM_CAP_BY_PROVIDER[provider] ?? 40;
  const trimmedItems = items.slice(0, itemCap);
  const userPrompt = buildUserPrompt({ items: trimmedItems, marketBlock, memoryBlock, dateLabel });

  const clientOpts = { apiKey, maxRetries: 0, timeout: 120_000 };
  if (providerCfg.baseURL) clientOpts.baseURL = providerCfg.baseURL;
  const client = new OpenAI(clientOpts);

  // max_tokens por provider:
  //   - Gemini: hasta 8192 en flash. Damos 8000.
  //   - Groq free tier topa 12K TPM total. Damos 4000 de output.
  //   - OpenAI gpt-4o-mini: 16K. Damos 4000.
  const maxTokensByProvider = { gemini: 8000, groq: 4000, openai: 4000 };
  const maxTokens = maxTokensByProvider[provider] ?? 4000;

  const promptTokensEst = Math.round(userPrompt.length / 4);
  console.log(`[summarize] Provider: ${provider} | Modelo: ${resolvedModel} | items=${trimmedItems.length}/${items.length} | prompt~${promptTokensEst}t | max_out=${maxTokens}`);
  const t0 = Date.now();

  const response = await callWithRetry(() => client.chat.completions.create({
    model: resolvedModel,
    temperature: 0.35,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
  }));

  const text = response.choices?.[0]?.message?.content?.trim() || '';
  const finishReason = response.choices?.[0]?.finish_reason || 'unknown';
  const usage = response.usage || {};

  console.log(`[summarize]   ${provider} ok en ${Date.now() - t0}ms — prompt=${usage.prompt_tokens ?? '?'} comp=${usage.completion_tokens ?? '?'} palabras=${text ? text.split(/\s+/).length : 0}`);
  return { text, finishReason, usage, resolvedModel };
}

// Orden de fallback: si el primario falla, intenta los demás siempre que
// tengan API key disponible.
function buildFallbackChain(primary) {
  const all = ['gemini', 'groq', 'openai'];
  return [primary, ...all.filter((p) => p !== primary)];
}

export async function summarizeBriefing(items, {
  apiKey,
  model,
  provider = 'gemini',
  lang = 'es',
  marketBlock = '',
  memoryBlock = '',
  dateLabel = '',
} = {}) {
  if (!items.length) return '_No se obtuvieron noticias en las últimas 24h._';

  console.log(`[summarize] items=${items.length} | mercado=${marketBlock ? 'sí' : 'no'} | memoria=${memoryBlock ? 'sí' : 'no'}`);

  const keysByProvider = {
    gemini: process.env.GEMINI_API_KEY,
    groq:   process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  if (apiKey) keysByProvider[provider] = apiKey;

  const chain = buildFallbackChain(provider).filter((p) => keysByProvider[p]);
  if (!chain.length) throw new Error('No hay ninguna API key disponible para los providers conocidos.');

  let lastErr = null;
  for (const p of chain) {
    const isPrimary = p === chain[0];
    try {
      const { text, finishReason, usage, resolvedModel } = await tryOneProvider({
        provider: p,
        apiKey: keysByProvider[p],
        model: isPrimary ? model : '',
        items, marketBlock, memoryBlock, dateLabel,
      });
      if (!text) {
        console.error(`[summarize] ${p} devolvió respuesta vacía. finish_reason=${finishReason} usage=${JSON.stringify(usage)}`);
        throw new Error(`Modelo ${resolvedModel} devolvió respuesta vacía (finish_reason=${finishReason}).`);
      }
      if (!isPrimary) console.warn(`[summarize] Fallback exitoso a ${p} tras fallo del primario.`);
      return text;
    } catch (err) {
      lastErr = err;
      console.error(`[summarize] Falló ${p}: status=${err?.status} ${err?.message?.slice(0, 200)}`);
      if (err?.error) console.error('[summarize]   detalle:', JSON.stringify(err.error).slice(0, 300));
      // Continuamos con el siguiente provider de la cadena.
    }
  }
  throw lastErr ?? new Error('Todos los providers fallaron sin error específico.');
}
