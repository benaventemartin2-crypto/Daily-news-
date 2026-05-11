# daily-news-briefing

Briefing **editorial** diario de noticias y mercados, enviado por Gmail todas las mañanas a las **07:00 hora Chile**.

Pensado para reemplazar la lectura matinal del diario: en vez de un feed de titulares sueltos, entrega un resumen redactado con contexto, indicadores económicos reales y continuidad entre días.

---

## ¿Qué hace?

1. **Recolecta** noticias desde feeds RSS de Reuters, BBC, NYT, FT, WSJ, The Guardian, CNBC, TechCrunch, The Verge, Wired, Diario Financiero, La Tercera (Pulso y Política), El Mostrador Mercados, BioBio, Emol y Ex-Ante. Opcionalmente complementa con [NewsAPI](https://newsapi.org/).
2. **Recolecta indicadores reales** desde fuentes públicas y sin API key:
   - [`mindicador.cl`](https://mindicador.cl) → Banco Central de Chile / SII (USD, UF, UTM, IPC, TPM, libra de cobre, Bitcoin).
   - [`stooq.com`](https://stooq.com) → IPSA, S&P 500, Nasdaq 100, Brent, WTI.
3. **Filtra determinísticamente** antes de tocar IA (frescura ≤ 36h, exclusión de farándula/deportes/crónica roja/opinión, dedupe exacto + Jaccard, cuotas por sección: mundo / Chile / negocios / mercados / tech).
4. **Lee la memoria editorial** (`data/memory.json`) con los temas tratados en los últimos 7 días para que el briefing pueda decir cosas como "se suma a la semana marcada por…" o "sigue la línea de ayer con…".
5. **Genera el briefing con IA** (Gemini, Groq u OpenAI) en 1.200–1.800 palabras, con la estructura editorial fija de abajo.
6. **Envía por Gmail** con HTML responsive (jerarquía clara, tabla de indicadores, tiempo de lectura).
7. **Persiste la memoria** del día (commit automático del workflow).

### Estructura del briefing

```
Briefing diario — [fecha]

1. Resumen ejecutivo          (5-8 líneas, apertura editorial en prosa)
2. Mundo                      (3-5 noticias con contexto integrado)
3. Chile                      (3-5 noticias con contexto integrado)
4. Economía y mercados        (tabla de indicadores + lectura de mercado)
5. Empresas y negocios        (3-5 movimientos corporativos con contexto)
6. Tecnología e innovación    (2-4 noticias con impacto económico)
7. Tema de fondo del día      (mini-columna explicativa, 300-500 palabras)
8. Qué mirar                  (3-5 señales concretas para seguir)
```

Eliminadas respecto a la versión anterior:
- "Por qué esto es importante" (el contexto va integrado en cada noticia).
- "Oportunidad / Riesgo" (reemplazada por "Qué mirar", concreta y accionable).

---

## Estructura del repo

```
.
├── .github/workflows/daily-briefing.yml   # Cron + commit de memoria
├── data/
│   └── memory.json                        # Memoria editorial (7 días). Se crea sola.
├── src/
│   ├── fetchNews.js          # RSS + NewsAPI
│   ├── fetchMarketData.js    # mindicador.cl + stooq.com (sin API key)
│   ├── filterNews.js         # Filtros, dedupe y cuotas por sección
│   ├── memory.js             # Persistencia de continuidad editorial
│   ├── summarizeBriefing.js  # Llamada al modelo con prompt editorial
│   ├── sendEmail.js          # Gmail SMTP + render HTML responsive
│   └── index.js              # Orquestador
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Instalación local

Requisitos: **Node.js 20+**.

```bash
git clone https://github.com/<tu-usuario>/daily-news-briefing.git
cd daily-news-briefing
npm install
cp .env.example .env
# Editar .env y completar las claves
```

### Probar sin enviar mail

```bash
DRY_RUN=true npm start
```

Recolecta, filtra, llama al modelo e imprime el briefing en consola. No toca Gmail.

### Ejecutar de verdad

```bash
npm start
```

---

## Configuración de secrets

### En GitHub (recomendado para el cron en la nube)

Ir a tu repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret                | Obligatorio | Descripción                                                                              |
| --------------------- | :---------: | ---------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`      |      ✅*    | Clave de Google Gemini (gratis). [Generar](https://aistudio.google.com/app/apikey).      |
| `GROQ_API_KEY`        |      ✅*    | Alternativa gratis. [Generar](https://console.groq.com/keys).                            |
| `OPENAI_API_KEY`      |      ✅*    | Alternativa de pago. [Generar](https://platform.openai.com/api-keys).                    |
| `GMAIL_USER`          |      ✅     | Tu correo Gmail completo (`tu.cuenta@gmail.com`).                                        |
| `GMAIL_APP_PASSWORD`  |      ✅     | App Password de 16 caracteres ([generar](https://myaccount.google.com/apppasswords)).    |
| `NEWS_API_KEY`        |    opcional | Cobertura adicional vía [NewsAPI](https://newsapi.org/). Funciona sin esto.              |
| `EMAIL_TO`            |    opcional | Destinatario. Si vacío, se envía a `GMAIL_USER`.                                         |

*Configura **uno** de los tres providers de IA. Por defecto se usa Gemini si está disponible.

> **Nota Gmail:** debes tener verificación en dos pasos activada y luego generar un *App Password*. El password normal de Gmail **no funciona** con SMTP.

#### Indicadores económicos

**Sin configuración.** La app llama directo a `mindicador.cl` y `stooq.com`, ambos públicos y gratis. Si alguno falla, el indicador queda como "no disponible" en el briefing — nunca se inventan datos.

#### Variables opcionales

En **Settings → Secrets and variables → Actions → Variables**:

| Variable        | Default            | Para qué sirve                                                                |
| --------------- | ------------------ | ----------------------------------------------------------------------------- |
| `AI_PROVIDER`   | `gemini`           | `gemini` / `groq` / `openai`.                                                 |
| `AI_MODEL`      | (default por prov.) | Cambia modelo sin tocar código (ej. `gemini-2.5-pro`, `gpt-4o`, `gpt-4.1-mini`). |

#### Permisos del workflow

Para que el workflow pueda commitear la memoria editorial (`data/memory.json`), el archivo `.github/workflows/daily-briefing.yml` ya declara:

```yaml
permissions:
  contents: write
```

Si tienes restricciones a nivel de organización, puede que necesites habilitar **Settings → Actions → General → Workflow permissions → Read and write permissions**.

### En local (`.env`)

Mismas variables, pero en un archivo `.env` (ver `.env.example`). **Nunca** lo commitees.

---

## Programación: 07:00 hora Chile

El workflow se dispara externamente vía `workflow_dispatch` (recomendado: val.town o cualquier scheduler externo). Si quieres usar el cron nativo de GitHub Actions, la lógica de DST ya está incluida (verano UTC-3 → `0 10 * * *`, invierno UTC-4 → `0 11 * * *`).

### Disparo manual

En la pestaña **Actions → Daily News Briefing → Run workflow** puedes lanzarlo en cualquier momento.

### Alternativa: cron local

```cron
# crontab -e
0 7 * * *  cd /ruta/al/repo && TZ=America/Santiago /usr/bin/node src/index.js >> briefing.log 2>&1
```

---

## Memoria editorial

La app mantiene `data/memory.json` con los últimos 7 días de:
- Titulares enviados al modelo.
- Línea-resumen del briefing del día.

Esto le permite al modelo escribir continuidad real entre días, no sólo titulares aislados. El workflow commitea automáticamente este archivo en cada corrida, así que la memoria se preserva entre ejecuciones del cron.

Para borrar la memoria: eliminar `data/memory.json` y commitear.

---

## Optimización de costos

| Optimización                                       | Dónde se aplica                          |
| -------------------------------------------------- | ---------------------------------------- |
| Filtro determinístico antes de IA                  | `filterNews.js` (keywords + frescura)    |
| Dedupe exacto + similitud Jaccard                  | `filterNews.js`                          |
| Cuotas por sección para no enviar ruido            | `filterNews.js → pickTop`                |
| Cap a `MAX_NEWS_TO_MODEL` (default 60)             | `index.js`                               |
| Indicadores cacheados desde APIs gratis            | `fetchMarketData.js` (sin costo)         |
| Memoria con resumen mínimo (no JSON gigante)       | `memory.js`                              |
| Modelo cambiable vía env                           | Variable `AI_MODEL`                      |

Logs típicos:

```
[fetch]   RSS: 412 items
[market]  11/12 indicadores con dato — 920ms
[filter]  412 -> 124 tras dedupe + exclusión + frescura
[filter]  Enviando al modelo: 60 (INT=38, CL=22)
[summarize] ok en 12030ms — tokens: prompt=4820 comp=2410 | palabras: 1543
```

Con `gemini-2.5-flash` el costo por corrida sigue siendo prácticamente cero. Con `gpt-4o-mini` ronda los USD $0.02 por briefing.

---

## Personalización rápida

- **Quitar / añadir fuentes RSS**: editar `RSS_SOURCES` en `src/fetchNews.js`.
- **Más / menos categorías excluidas**: editar `EXCLUDE_KEYWORDS` en `src/filterNews.js`.
- **Cambiar la estructura del briefing**: editar el `buildUserPrompt` en `src/summarizeBriefing.js`.
- **Cambiar indicadores**: editar `STOOQ_TICKERS` y `buildChileIndicators` en `src/fetchMarketData.js`.
- **Cambiar destinatario**: setear `EMAIL_TO` en secrets (o `.env`).

---

## Troubleshooting

| Síntoma                                            | Posible causa / solución                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `Falta la API key para el provider "..."`           | Configurá el secret correspondiente o cambiá `AI_PROVIDER`.                |
| `Invalid login: 535-5.7.8 ...`                      | No estás usando un **App Password** de Gmail.                              |
| El mail no llega y los logs muestran `enviado: <id>` | Revisar Spam, o que `EMAIL_TO` esté bien escrito.                          |
| Faltan noticias de Chile                            | Algunos RSS chilenos caen ocasionalmente; revisá logs `[warn] RSS falló`.  |
| Indicadores como "no disponible"                    | mindicador.cl o stooq estaban caídos esa corrida. Vuelve solo al día siguiente. |
| Memoria no persiste entre días                      | Verificá que el workflow tenga `permissions: contents: write`.             |

---

## Licencia

MIT.
