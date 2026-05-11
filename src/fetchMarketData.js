// Indicadores económicos y de mercado.
// Fuentes públicas y gratuitas, sin API key:
//   - mindicador.cl     -> Banco Central de Chile / SII (USD, EUR, UF, UTM, IPC, TPM, libra cobre, BTC)
//   - stooq.com         -> Mercados internacionales (S&P 500, Nasdaq, Brent, WTI, BTC alternativo)
// Si una fuente falla, el indicador queda como { value: null, source: 'no disponible' }.
// Nunca se inventan datos.

const MINDICADOR_URL = 'https://mindicador.cl/api';

// Códigos Stooq (free CSV API). El sufijo .us / .uk no aplica; usamos los símbolos canónicos.
//   ^spx  -> S&P 500
//   ^ndx  -> Nasdaq 100  (^ndq también; usamos ^ndx que es estable)
//   cb.f  -> Brent crude futures (continuo)
//   cl.f  -> WTI crude futures (continuo)
//   btcusd -> Bitcoin spot
const STOOQ_TICKERS = [
  { key: 'sp500',   symbol: '^spx',   label: 'S&P 500',         unit: 'pts',   context: 'Bolsa EE.UU. (referencia global)' },
  { key: 'nasdaq',  symbol: '^ndx',   label: 'Nasdaq 100',      unit: 'pts',   context: 'Bolsa tech EE.UU.' },
  { key: 'brent',   symbol: 'cb.f',   label: 'Petróleo Brent',  unit: 'USD/bbl', context: 'Referencia internacional del crudo' },
  { key: 'wti',     symbol: 'cl.f',   label: 'Petróleo WTI',    unit: 'USD/bbl', context: 'Referencia EE.UU. del crudo' },
  { key: 'btc_intl', symbol: 'btcusd', label: 'Bitcoin (Stooq)', unit: 'USD',   context: 'Spot internacional' },
];

const STOOQ_TIMEOUT_MS = 8000;
const MINDICADOR_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'daily-news-briefing/2.0' } });
  } finally {
    clearTimeout(t);
  }
}

function fmtIsoDate(d) {
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
}

function unavailable(label, unit, context, reason = 'no disponible') {
  return { label, value: null, unit, date: null, change: null, source: reason, context };
}

// --- mindicador.cl --------------------------------------------------

async function fetchMindicadorAll() {
  try {
    const res = await fetchWithTimeout(MINDICADOR_URL, MINDICADOR_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`  [warn] mindicador.cl falló: ${err.message}`);
    return null;
  }
}

// Para variación diaria de Chile, golpeamos el endpoint individual /:codigo
// que trae serie histórica con los últimos valores.
async function fetchMindicadorSeries(code) {
  try {
    const res = await fetchWithTimeout(`${MINDICADOR_URL}/${code}`, MINDICADOR_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json?.serie) ? json.serie : [];
  } catch (err) {
    console.warn(`  [warn] mindicador.cl/${code} falló: ${err.message}`);
    return [];
  }
}

function pctChange(curr, prev) {
  if (typeof curr !== 'number' || typeof prev !== 'number' || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

async function buildChileIndicators(snapshot) {
  // snapshot trae el último valor de cada indicador. Para variación,
  // pedimos serie sólo de los que mostramos.
  const series = {};
  const codesNeedingChange = ['dolar', 'cobre', 'bitcoin'];
  await Promise.all(codesNeedingChange.map(async (c) => {
    series[c] = await fetchMindicadorSeries(c);
  }));

  function fromSnap(code, label, unit, context, { withChange = false } = {}) {
    const node = snapshot?.[code];
    if (!node || typeof node.valor !== 'number') {
      return unavailable(label, unit, context, 'mindicador.cl sin dato');
    }
    let change = null;
    if (withChange && series[code]?.length >= 2) {
      const [latest, prev] = series[code];
      change = pctChange(latest.valor, prev.valor);
    }
    return {
      label,
      value: node.valor,
      unit,
      date: fmtIsoDate(node.fecha),
      change,
      source: 'mindicador.cl (Banco Central / SII)',
      context,
    };
  }

  return {
    usd:    fromSnap('dolar',  'Dólar observado', 'CLP',     'Tipo de cambio publicado por el Banco Central', { withChange: true }),
    uf:     fromSnap('uf',     'UF',              'CLP',     'Unidad de Fomento, reajustable por inflación'),
    utm:    fromSnap('utm',    'UTM',             'CLP',     'Unidad Tributaria Mensual (SII)'),
    ipc:    fromSnap('ipc',    'IPC mensual Chile', '%',     'Variación mensual del IPC publicada por el INE'),
    tpm:    fromSnap('tpm',    'TPM Chile',       '%',       'Tasa de Política Monetaria del Banco Central'),
    cobre:  fromSnap('libra_cobre', 'Cobre',      'USD/lb',  'Precio referencia de la libra de cobre', { withChange: true }),
    btc_cl: fromSnap('bitcoin', 'Bitcoin (mindicador)', 'USD','Spot reportado por mindicador.cl', { withChange: true }),
  };
}

// --- IPSA (Yahoo Finance via Stooq alt) -----------------------------
// IPSA en Stooq se busca como ^ipsa. Si falla, intentamos Yahoo Finance Quote API
// (no requiere key pero tiene rate limits).

async function fetchStooqQuote(symbol) {
  // Endpoint CSV con OHLCV: la última fila trae fecha y close.
  // h&e=csv -> incluir headers
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlc&h&e=csv`;
  try {
    const res = await fetchWithTimeout(url, STOOQ_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('respuesta vacía');
    const header = lines[0].toLowerCase().split(',');
    const row = lines[1].split(',');
    const get = (k) => {
      const i = header.indexOf(k);
      return i >= 0 ? row[i] : null;
    };
    const close = parseFloat(get('close'));
    const open = parseFloat(get('open'));
    const date = get('date');
    if (!Number.isFinite(close)) throw new Error(`close inválido: ${get('close')}`);
    return {
      close,
      open: Number.isFinite(open) ? open : null,
      date: date || null,
    };
  } catch (err) {
    console.warn(`  [warn] Stooq ${symbol} falló: ${err.message}`);
    return null;
  }
}

async function buildIntlIndicator({ key, symbol, label, unit, context }) {
  const q = await fetchStooqQuote(symbol);
  if (!q) return [key, unavailable(label, unit, context, 'stooq sin dato')];
  const change = pctChange(q.close, q.open);
  return [key, {
    label,
    value: q.close,
    unit,
    date: q.date,
    change,
    source: 'stooq.com',
    context,
  }];
}

async function buildIpsa() {
  // IPSA en Stooq: ^ipsa
  const q = await fetchStooqQuote('^ipsa');
  if (!q) return unavailable('IPSA', 'pts', 'Índice principal de la Bolsa de Santiago', 'stooq sin dato');
  const change = pctChange(q.close, q.open);
  return {
    label: 'IPSA',
    value: q.close,
    unit: 'pts',
    date: q.date,
    change,
    source: 'stooq.com',
    context: 'Índice principal de la Bolsa de Santiago',
  };
}

// --- Orquestador público --------------------------------------------

async function fetchMarketDataInternal() {
  const t0 = Date.now();

  // Promise.allSettled para que un fallo aislado no rompa todo.
  const settled = await Promise.allSettled([
    fetchMindicadorAll(),
    buildIpsa(),
    ...STOOQ_TICKERS.map(buildIntlIndicator),
  ]);
  const snapshot = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const ipsa = settled[1].status === 'fulfilled'
    ? settled[1].value
    : unavailable('IPSA', 'pts', 'Índice principal de la Bolsa de Santiago', 'error de red');
  const intlEntries = settled.slice(2).map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    const t = STOOQ_TICKERS[idx];
    return [t.key, unavailable(t.label, t.unit, t.context, 'error de red')];
  });

  const cl = snapshot
    ? await buildChileIndicators(snapshot)
    : {
        usd: unavailable('Dólar observado', 'CLP', 'Tipo de cambio publicado por el Banco Central'),
        uf:  unavailable('UF', 'CLP', 'Unidad de Fomento, reajustable por inflación'),
        utm: unavailable('UTM', 'CLP', 'Unidad Tributaria Mensual (SII)'),
        ipc: unavailable('IPC mensual Chile', '%', 'Variación mensual del IPC publicada por el INE'),
        tpm: unavailable('TPM Chile', '%', 'Tasa de Política Monetaria del Banco Central'),
        cobre: unavailable('Cobre', 'USD/lb', 'Precio referencia de la libra de cobre'),
        btc_cl: unavailable('Bitcoin (mindicador)', 'USD', 'Spot reportado por mindicador.cl'),
      };

  const intl = Object.fromEntries(intlEntries);

  // Bitcoin: preferimos mindicador (CLP-aware) pero si falla usamos stooq.
  const bitcoin = (cl.btc_cl.value != null) ? cl.btc_cl : intl.btc_intl;

  const indicators = {
    usd:     cl.usd,
    uf:      cl.uf,
    utm:     cl.utm,
    ipc_cl:  cl.ipc,
    tpm_cl:  cl.tpm,
    ipsa,
    cobre:   cl.cobre,
    brent:   intl.brent,
    wti:     intl.wti,
    sp500:   intl.sp500,
    nasdaq:  intl.nasdaq,
    bitcoin,
  };

  const ok = Object.values(indicators).filter((x) => x.value != null).length;
  console.log(`[market]   ${ok}/${Object.keys(indicators).length} indicadores con dato — ${Date.now() - t0}ms`);
  return indicators;
}

// Wrapper que garantiza que esta función NUNCA tire excepción.
// Si todo falla, devolvemos null y el briefing se genera sin tabla de indicadores.
export async function fetchMarketData() {
  console.log('[market] Recolectando indicadores económicos...');
  try {
    return await fetchMarketDataInternal();
  } catch (err) {
    console.warn(`[market] Falla global en recolección de indicadores: ${err.message}. Continuamos sin tabla de mercado.`);
    return null;
  }
}

// Render Markdown legible para el mail (lo consume el render HTML).
export function renderMarketTable(ind) {
  const order = ['usd', 'uf', 'utm', 'tpm_cl', 'ipc_cl', 'ipsa', 'cobre', 'brent', 'wti', 'sp500', 'nasdaq', 'bitcoin'];

  const fmtValue = (v, unit) => {
    if (v == null) return '_no disponible_';
    const num = Math.abs(v) >= 1000
      ? v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
      : v.toLocaleString('es-CL', { maximumFractionDigits: 2 });
    return unit === '%' ? `${num}%` : `${num}${unit ? ' ' + unit : ''}`;
  };

  const fmtChange = (c) => {
    if (c == null) return '';
    const sign = c >= 0 ? '+' : '';
    return ` (${sign}${c.toFixed(2)}%)`;
  };

  // Formato Markdown extendido con marca `MARKET_ROW|...` que el HTML renderer convierte a tabla.
  const rows = order
    .map((k) => ind[k])
    .filter(Boolean)
    .map((x) => {
      const value = fmtValue(x.value, x.unit) + fmtChange(x.change);
      const date = x.date || (x.value != null ? '' : '');
      return `MARKET_ROW|${x.label}|${value}|${date}|${x.context}|${x.source}`;
    });

  return rows.join('\n');
}

// Render compacto en texto para inyectar al prompt del modelo.
export function renderMarketForPrompt(ind) {
  const lines = [];
  for (const [, x] of Object.entries(ind)) {
    if (!x) continue;
    if (x.value == null) {
      lines.push(`- ${x.label}: no disponible (${x.source})`);
    } else {
      const change = x.change != null ? ` (var. ${x.change >= 0 ? '+' : ''}${x.change.toFixed(2)}%)` : '';
      const date = x.date ? ` [fecha: ${x.date}]` : '';
      lines.push(`- ${x.label}: ${x.value} ${x.unit}${change}${date} — fuente: ${x.source}`);
    }
  }
  return lines.join('\n');
}
