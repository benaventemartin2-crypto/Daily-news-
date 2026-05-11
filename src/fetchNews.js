import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'daily-news-briefing/2.0 (+github actions)' },
});

const RSS_SOURCES = [
  // ===== Internacional - mundo / geopolítica =====
  { name: 'Reuters World',           url: 'https://www.reutersagency.com/feed/?best-topics=world&post_type=best',         region: 'INT', tags: ['world'] },
  { name: 'BBC World',               url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                                   region: 'INT', tags: ['world'] },
  { name: 'NYT World',               url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',                        region: 'INT', tags: ['world'] },
  { name: 'Al Jazeera',              url: 'https://www.aljazeera.com/xml/rss/all.xml',                                     region: 'INT', tags: ['world'] },
  { name: 'The Guardian World',      url: 'https://www.theguardian.com/world/rss',                                         region: 'INT', tags: ['world'] },

  // ===== Internacional - economía / mercados / negocios =====
  { name: 'Reuters Business',        url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', region: 'INT', tags: ['business', 'markets'] },
  { name: 'BBC Business',            url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                                region: 'INT', tags: ['business'] },
  { name: 'NYT Business',            url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',                     region: 'INT', tags: ['business'] },
  { name: 'CNBC Top News',           url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                         region: 'INT', tags: ['markets', 'business'] },
  { name: 'CNBC Markets',            url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html',                          region: 'INT', tags: ['markets'] },
  { name: 'FT Front Page',           url: 'https://www.ft.com/?format=rss',                                                region: 'INT', tags: ['markets', 'business'] },
  { name: 'WSJ Markets',             url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',                                 region: 'INT', tags: ['markets'] },

  // ===== Tecnología / IA / startups / big tech =====
  { name: 'TechCrunch',              url: 'https://techcrunch.com/feed/',                                                  region: 'INT', tags: ['tech'] },
  { name: 'The Verge',               url: 'https://www.theverge.com/rss/index.xml',                                        region: 'INT', tags: ['tech'] },
  { name: 'Ars Technica',            url: 'https://feeds.arstechnica.com/arstechnica/index',                               region: 'INT', tags: ['tech'] },
  { name: 'MIT Tech Review',         url: 'https://www.technologyreview.com/feed/',                                        region: 'INT', tags: ['tech'] },
  { name: 'Hacker News Front',       url: 'https://hnrss.org/frontpage',                                                   region: 'INT', tags: ['tech'] },
  { name: 'Wired',                   url: 'https://www.wired.com/feed/rss',                                                region: 'INT', tags: ['tech'] },

  // ===== Chile - economía / mercados / negocios =====
  { name: 'Diario Financiero',       url: 'https://www.df.cl/rss',                                                         region: 'CL', tags: ['business', 'markets'] },
  { name: 'La Tercera Pulso',        url: 'https://www.latercera.com/arc/outboundfeeds/rss/category/pulso/?outputType=xml', region: 'CL', tags: ['business'] },
  { name: 'El Mostrador Mercados',   url: 'https://www.elmostrador.cl/mercados/feed/',                                     region: 'CL', tags: ['business', 'markets'] },
  { name: 'BioBio Economía',         url: 'https://www.biobiochile.cl/lista/categorias/economia/feed',                     region: 'CL', tags: ['business'] },
  { name: 'Emol Economía',           url: 'https://www.emol.com/sitios/rss/noticias.asp?canal=economia',                   region: 'CL', tags: ['business'] },
  { name: 'Ex-Ante',                 url: 'https://www.ex-ante.cl/feed/',                                                  region: 'CL', tags: ['country'] },

  // ===== Chile - país / política / regulación =====
  { name: 'La Tercera Política',     url: 'https://www.latercera.com/arc/outboundfeeds/rss/category/politica/?outputType=xml', region: 'CL', tags: ['country'] },
  { name: 'Emol Nacional',           url: 'https://www.emol.com/sitios/rss/noticias.asp?canal=nacional',                   region: 'CL', tags: ['country'] },
  { name: 'BioBio Nacional',         url: 'https://www.biobiochile.cl/lista/categorias/nacional/feed',                     region: 'CL', tags: ['country'] },
];

async function fetchFromRss(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).map((item) => ({
      title: (item.title || '').trim(),
      description: (item.contentSnippet || item.summary || item.content || '').trim().slice(0, 600),
      link: item.link || item.guid || '',
      publishedAt: item.isoDate || item.pubDate || null,
      source: source.name,
      region: source.region,
      tags: source.tags || [],
    }));
    return items.filter((i) => i.title);
  } catch (err) {
    console.warn(`  [warn] RSS falló ${source.name}: ${err.message}`);
    return [];
  }
}

async function fetchFromNewsApi(apiKey) {
  if (!apiKey) return [];
  const queries = [
    { region: 'INT', tags: ['business'], url: `https://newsapi.org/v2/top-headlines?language=en&category=business&pageSize=30&apiKey=${apiKey}` },
    { region: 'INT', tags: ['tech'],     url: `https://newsapi.org/v2/top-headlines?language=en&category=technology&pageSize=30&apiKey=${apiKey}` },
    { region: 'CL',  tags: ['business'], url: `https://newsapi.org/v2/top-headlines?country=cl&category=business&pageSize=30&apiKey=${apiKey}` },
    { region: 'CL',  tags: ['country'],  url: `https://newsapi.org/v2/everything?q=Chile+economia&language=es&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}` },
  ];

  const all = [];
  for (const q of queries) {
    try {
      const res = await fetch(q.url);
      if (!res.ok) {
        console.warn(`  [warn] NewsAPI HTTP ${res.status} en ${q.region}`);
        continue;
      }
      const data = await res.json();
      const items = (data.articles || []).map((a) => ({
        title: (a.title || '').trim(),
        description: (a.description || '').trim().slice(0, 600),
        link: a.url || '',
        publishedAt: a.publishedAt || null,
        source: a.source?.name || 'NewsAPI',
        region: q.region,
        tags: q.tags,
      }));
      all.push(...items.filter((i) => i.title));
    } catch (err) {
      console.warn(`  [warn] NewsAPI error: ${err.message}`);
    }
  }
  return all;
}

export async function fetchNews({ newsApiKey } = {}) {
  console.log(`[fetch] Recolectando desde ${RSS_SOURCES.length} fuentes RSS...`);
  const rssResults = await Promise.all(RSS_SOURCES.map(fetchFromRss));
  const rssItems = rssResults.flat();
  console.log(`[fetch]   RSS: ${rssItems.length} items`);

  const newsApiItems = await fetchFromNewsApi(newsApiKey);
  if (newsApiKey) console.log(`[fetch]   NewsAPI: ${newsApiItems.length} items`);

  const all = [...rssItems, ...newsApiItems];
  console.log(`[fetch] Total recolectado: ${all.length} items`);
  return all;
}
