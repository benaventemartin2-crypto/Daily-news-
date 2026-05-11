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

async function callWithRetry(fn, { retries = 3, baseDelayMs = 4000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.status === 429 || err?.status >= 500;
      if (!isRetryable || attempt === retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[summarize] HTTP ${err.status} — retry en ${delay}ms (${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
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

  const providerCfg = PROVIDERS[provider] ?? PROVIDERS.gemini;
  const resolvedModel = model || providerCfg.defaultModel;

  if (!apiKey) {
    throw new Error(
      `Falta la API key para el provider "${provider}". Configura el secret ${providerCfg.envKey}.`
    );
  }

  const clientOpts = { apiKey, maxRetries: 0, timeout: 120_000 };
  if (providerCfg.baseURL) clientOpts.baseURL = providerCfg.baseURL;
  const client = new OpenAI(clientOpts);

  const userPrompt = buildUserPrompt({ items, marketBlock, memoryBlock, dateLabel });

  // max_tokens por provider:
  //   - Gemini: hasta 8192 en flash. Damos 8000 para que quepa el briefing largo + thinking.
  //   - Groq (llama-3.3-70b-versatile): topa en 8000-8192 según versión. Damos 7000.
  //   - OpenAI gpt-4o-mini: 16K. Damos 4000 (más que suficiente para 1800 palabras).
  const maxTokensByProvider = { gemini: 8000, groq: 7000, openai: 4000 };
  const maxTokens = maxTokensByProvider[provider] ?? 4000;

  console.log(`[summarize] Provider: ${provider} | Modelo: ${resolvedModel} | Items: ${items.length} | max_tokens: ${maxTokens} | Mercado: ${marketBlock ? 'sí' : 'no'} | Memoria: ${memoryBlock ? 'sí' : 'no'}`);
  const t0 = Date.now();

  let response;
  try {
    response = await callWithRetry(() => client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.35,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    }));
  } catch (err) {
    console.error(`[summarize] ERROR provider=${provider} modelo=${resolvedModel} status=${err?.status} mensaje="${err?.message}"`);
    if (err?.error) console.error('[summarize] detalle:', JSON.stringify(err.error).slice(0, 500));
    throw err;
  }

  const text = response.choices?.[0]?.message?.content?.trim() || '';
  const finishReason = response.choices?.[0]?.finish_reason || 'unknown';
  const usage = response.usage || {};

  if (!text) {
    console.error(`[summarize] Respuesta vacía. finish_reason=${finishReason} usage=${JSON.stringify(usage)}`);
    throw new Error(`El modelo ${resolvedModel} devolvió respuesta vacía (finish_reason=${finishReason}). Probable causa: max_tokens insuficiente o filtro de safety. Considera cambiar AI_MODEL o reducir MAX_NEWS_TO_MODEL.`);
  }

  console.log(`[summarize]   ok en ${Date.now() - t0}ms — tokens: prompt=${usage.prompt_tokens ?? '?'} comp=${usage.completion_tokens ?? '?'} | palabras: ${text.split(/\s+/).length}`);
  return text;
}
