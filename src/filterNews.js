// Filtro determinístico previo a la IA. Objetivo: bajar costo de tokens y ruido.

const EXCLUDE_KEYWORDS = [
  // Farándula
  'farándula', 'farandula', 'celebridad', 'celebrity', 'kardashian', 'gossip', 'chisme',
  'instagram', 'tiktok viral', 'reality', 'gran hermano', 'mtv', 'oscars', 'grammys',
  'red carpet', 'alfombra roja', 'coleo', 'pareja de', 'romance',

  // Deportes
  'fútbol', 'futbol', 'football', 'soccer', 'champions league', 'premier league',
  'la liga', 'nba', 'nfl', 'mlb', 'tenis ', 'tennis', 'golf', 'fórmula 1', 'formula 1',
  'f1 ', 'motogp', 'colo colo', 'colo-colo', 'universidad de chile', 'la roja',
  'mundial', 'copa américa', 'copa america', 'olimpiad', 'olympic',

  // Crónica roja
  'crónica roja', 'cronica roja', 'asesinato', 'homicidio', 'femicidio', 'apuñal',
  'baleado', 'baleada', 'narcotráfico', 'narcotrafico', 'pandilla', 'sicariato',
  'descuartiz', 'cadáver', 'cadaver', 'violación', 'violacion', 'abuso sexual',
  'tren de aragua', 'masacre', 'tiroteo', 'shooting', 'stabbed', 'murder',

  // Opinión / columnas
  'opinión:', 'opinion:', 'columna:', 'editorial:', 'carta al director',
  'op-ed', 'analysis:', 'commentary:', 'mi opinión', 'mi opinion',

  // Regulación chilena (excluir explícitamente)
  'sernac ', 'cmf ', 'superintendencia ', 'contraloría', 'contraloria',
  'reforma tributaria', 'reforma previsional', 'reforma de pensiones',
  'ley corta', 'ley larga', 'proyecto de ley', 'congreso chileno',
  'cámara de diputados', 'camara de diputados', 'senado chileno',
];

const CHILE_HINTS = [
  'chile', 'chileno', 'chilena', 'santiago', 'valparaíso', 'valparaiso',
  'concepción', 'concepcion', 'antofagasta', 'codelco', 'lan ', 'latam',
  'cencosud', 'falabella', 'sqm', 'banco de chile', 'enel chile', 'colbun',
  'colbún', 'enap', 'mineduc', 'banco central de chile',
];

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
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
  if (!dateStr) return true; // si no hay fecha, no descartamos
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return true;
  return Date.now() - d <= hours * 3600 * 1000;
}

function classifyRegion(item) {
  if (item.region) return item.region;
  const text = normalize(`${item.title} ${item.description}`);
  return hasAny(text, CHILE_HINTS) ? 'CL' : 'INT';
}

export function filterNews(items, { maxAgeHours = 36 } = {}) {
  const startCount = items.length;

  // 1) Frescura
  let filtered = items.filter((i) => isWithinHours(i.publishedAt, maxAgeHours));

  // 2) Exclusión por palabras clave (asunto vetado)
  filtered = filtered.filter((i) => {
    const text = normalize(`${i.title} ${i.description}`);
    return !hasAny(text, EXCLUDE_KEYWORDS);
  });

  // 3) Clasificar región
  filtered = filtered.map((i) => ({ ...i, region: classifyRegion(i) }));

  // 4) Deduplicar por título exacto normalizado
  const byTitle = new Map();
  for (const i of filtered) {
    const key = normalize(i.title).slice(0, 120);
    if (!byTitle.has(key)) byTitle.set(key, i);
  }
  filtered = Array.from(byTitle.values());

  // 5) Deduplicar por similitud (Jaccard sobre tokens del título)
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

export function pickTop(items, { maxToModel = 40 } = {}) {
  // Balanceamos por región para que el modelo reciba algo de ambos.
  const cl = items.filter((i) => i.region === 'CL');
  const intl = items.filter((i) => i.region === 'INT');

  const score = (i) => {
    const ts = i.publishedAt ? new Date(i.publishedAt).getTime() : 0;
    return ts;
  };
  cl.sort((a, b) => score(b) - score(a));
  intl.sort((a, b) => score(b) - score(a));

  const targetCl = Math.min(Math.floor(maxToModel * 0.35), cl.length);
  const targetIntl = Math.min(maxToModel - targetCl, intl.length);

  const picked = [...intl.slice(0, targetIntl), ...cl.slice(0, targetCl)];
  console.log(`[filter] Enviando al modelo: ${picked.length} (INT=${targetIntl}, CL=${targetCl})`);
  return picked;
}
