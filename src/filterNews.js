// Filtro determinístico previo a la IA. Objetivo: bajar costo de tokens y ruido.
// IMPORTANTE: la regulación chilena (CMF, BCCh, reformas, congreso) ya NO se excluye:
// es justamente el tipo de contexto país que el briefing necesita.

const EXCLUDE_KEYWORDS = [
  // Farándula
  'farándula', 'farandula', 'celebridad', 'celebrity', 'kardashian', 'gossip', 'chisme',
  'tiktok viral', ' reality ', 'gran hermano', ' mtv ', ' oscars ', ' grammys ',
  'red carpet', 'alfombra roja', 'pareja de', ' romance ',

  // Deportes (acrónimos van con espacios alrededor para evitar falsos positivos
  // como "nfl" dentro de "inflación" o "nba" dentro de palabras compuestas).
  'fútbol', 'futbol', 'football', 'soccer', 'champions league', 'premier league',
  ' la liga ', ' nba ', ' nfl ', ' mlb ', ' tenis ', 'tennis', ' golf ', 'fórmula 1', 'formula 1',
  ' f1 ', 'motogp', 'colo colo', 'colo-colo', 'universidad de chile', ' la roja ',
  'mundial de', 'copa américa', 'copa america', 'olimpiad', 'olympic',

  // Crónica roja
  'crónica roja', 'cronica roja', 'asesinato', 'homicidio', 'femicidio', 'apuñal',
  'baleado', 'baleada', 'pandilla', 'sicariato',
  'descuartiz', 'cadáver', 'cadaver', 'violación', 'violacion', 'abuso sexual',
  'masacre', 'tiroteo', 'shooting ', 'stabbed', 'murder',

  // Opinión / columnas
  'opinión:', 'opinion:', 'columna:', 'editorial:', 'carta al director',
  'op-ed', 'analysis:', 'commentary:', 'mi opinión', 'mi opinion',
];

const CHILE_HINTS = [
  'chile', 'chileno', 'chilena', 'santiago', 'valparaíso', 'valparaiso',
  'concepción', 'concepcion', 'antofagasta', 'codelco', 'lan ', 'latam',
  'cencosud', 'falabella', 'sqm', 'banco de chile', 'enel chile', 'colbun',
  'colbún', 'enap', 'mineduc', 'banco central de chile', 'cmf', 'sernac',
  'boric', 'la moneda', 'congreso nacional', 'cámara de diputados', 'camara de diputados',
];

const TAG_HINTS = {
  tech: [
    'ai ', ' ia ', 'artificial intelligence', 'inteligencia artificial', 'openai', 'anthropic',
    'chatgpt', 'gemini', 'claude', 'llama', 'nvidia', 'chip', 'semiconductor', 'tsmc',
    'startup', 'silicon valley', 'cloud ', 'datacenter', 'data center', 'ciberseguridad',
    'cyber', 'hack', 'tesla', 'ev ', 'electric vehicle', 'auto eléctrico', 'auto electrico',
    'apple', 'microsoft', 'google', 'amazon', 'meta ', 'spacex',
  ],
  business: [
    'utilidades', 'resultados', 'earnings', 'revenue', 'merger', 'acquisition', 'fusión',
    'fusion', 'adquisición', 'adquisicion', 'ipo', 'oferta pública', 'oferta publica',
    'profit', 'beneficio neto', 'ebitda', 'ceo', 'directorio', 'capital', 'inversión',
    'inversion', 'fondo soberano', 'private equity', 'banco', 'retailer', 'minera',
    'energía', 'energia', 'telco',
  ],
  markets: [
    'bolsa', 'mercado', 'fed ', 'banco central', 'tasa', 'rate', 'yield', 'bono',
    'treasury', 'inflation', 'inflación', 'inflacion', 'pib ', 'gdp', 'cobre', 'oil',
    'petróleo', 'petroleo', 'brent', 'wti', 'dólar', 'dolar', 'peso ', 'euro ',
    'ipsa', 's&p', 'nasdaq', 'dow jones',
  ],
  world: [
    'china', 'estados unidos', 'eeuu', 'ee.uu', 'rusia', 'ucrania', 'israel', 'palestina',
    'irán', 'iran', 'gaza', 'taiwán', 'taiwan', 'unión europea', 'union europea',
    'argentina', 'brasil', 'milei', 'lula', 'putin', 'xi jinping', 'biden', 'trump',
    'reserva federal', 'bce ', 'european central bank',
  ],
  country: [
    'gobierno', 'ministro', 'ministra', 'la moneda', 'congreso', 'reforma', 'presupuesto',
    'fiscal', 'tributari', 'previsional', 'pensión', 'pension', 'seguridad', 'delincuencia',
    'inversión', 'inversion', 'desempleo', 'empleo',
  ],
};

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s&.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text, list) {
  const t = ` ${text} `;
  return list.some((kw) => t.includes(kw));
}

function tokenize(text) {
  return new Set(normalize(text).split(' ').filter((w) => w.length > 3));
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return inter / union;
}

function isWithinHours(dateStr, hours) {
  if (!dateStr) return true;
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return true;
  return Date.now() - d <= hours * 3600 * 1000;
}

function classifyRegion(item) {
  if (item.region) return item.region;
  const text = normalize(`${item.title} ${item.description}`);
  return hasAny(text, CHILE_HINTS) ? 'CL' : 'INT';
}

function classifyTags(item) {
  // Combinamos los tags declarados por la fuente con los detectados por contenido.
  const text = ` ${normalize(`${item.title} ${item.description}`)} `;
  const out = new Set(item.tags || []);
  for (const [tag, kws] of Object.entries(TAG_HINTS)) {
    if (kws.some((kw) => text.includes(kw))) out.add(tag);
  }
  // Si es CL y no tiene tag, lo marcamos como country por defecto.
  if (item.region === 'CL' && out.size === 0) out.add('country');
  if (item.region === 'INT' && out.size === 0) out.add('world');
  return Array.from(out);
}

export function filterNews(items, { maxAgeHours = 36 } = {}) {
  const startCount = items.length;

  let filtered = items.filter((i) => isWithinHours(i.publishedAt, maxAgeHours));

  filtered = filtered.filter((i) => {
    const text = normalize(`${i.title} ${i.description}`);
    return !hasAny(text, EXCLUDE_KEYWORDS);
  });

  filtered = filtered.map((i) => {
    const region = classifyRegion(i);
    const enriched = { ...i, region };
    enriched.tags = classifyTags(enriched);
    return enriched;
  });

  // Dedupe exacto por título
  const byTitle = new Map();
  for (const i of filtered) {
    const key = normalize(i.title).slice(0, 120);
    if (!byTitle.has(key)) byTitle.set(key, i);
  }
  filtered = Array.from(byTitle.values());

  // Dedupe por similitud (Jaccard sobre tokens del título)
  const deduped = [];
  const seenTokens = [];
  for (const i of filtered) {
    const tokens = tokenize(i.title);
    let dup = false;
    for (const t of seenTokens) {
      if (jaccard(tokens, t) >= 0.6) { dup = true; break; }
    }
    if (!dup) {
      deduped.push(i);
      seenTokens.push(tokens);
    }
  }

  console.log(`[filter] ${startCount} -> ${deduped.length} tras dedupe + exclusión + frescura`);
  return deduped;
}

// Selección balanceada por región y por tema. La idea es que el modelo
// tenga material suficiente para llenar TODAS las secciones del briefing.
export function pickTop(items, { maxToModel = 60 } = {}) {
  const score = (i) => (i.publishedAt ? new Date(i.publishedAt).getTime() : 0);
  const sorted = [...items].sort((a, b) => score(b) - score(a));

  // Cuotas mínimas por sección (suman ~maxToModel)
  const quotas = {
    world:    Math.round(maxToModel * 0.20),  // 12 si max=60
    business: Math.round(maxToModel * 0.20),
    markets:  Math.round(maxToModel * 0.15),
    tech:     Math.round(maxToModel * 0.15),
    country:  Math.round(maxToModel * 0.30),  // Chile + país pesan más
  };

  const picked = [];
  const seen = new Set();
  const counts = { world: 0, business: 0, markets: 0, tech: 0, country: 0 };

  // Primera pasada: cubrir cuotas por tag
  for (const tag of Object.keys(quotas)) {
    for (const it of sorted) {
      if (seen.has(it.link || it.title)) continue;
      if (!it.tags?.includes(tag)) continue;
      // country es exclusivo de Chile
      if (tag === 'country' && it.region !== 'CL') continue;
      if (counts[tag] >= quotas[tag]) break;
      picked.push(it);
      seen.add(it.link || it.title);
      counts[tag]++;
    }
  }

  // Segunda pasada: si sobra cupo, llenar con lo más reciente
  for (const it of sorted) {
    if (picked.length >= maxToModel) break;
    if (seen.has(it.link || it.title)) continue;
    picked.push(it);
    seen.add(it.link || it.title);
  }

  const cl = picked.filter((i) => i.region === 'CL').length;
  const intl = picked.length - cl;
  console.log(`[filter] Enviando al modelo: ${picked.length} (INT=${intl}, CL=${cl}) | tags: ${JSON.stringify(counts)}`);
  return picked.slice(0, maxToModel);
}
