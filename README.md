# daily-news-briefing

Briefing diario de noticias **personalizado y enviado por Gmail** todos los días a las **07:00 hora Chile**.

Está pensado para profesionales que **no quieren leer diarios completos** y solo necesitan un resumen denso, sin farándula, deportes, crónica roja, opinión, ni regulación chilena.

---

## ¿Qué hace?

1. **Recolecta** titulares + descripciones desde feeds RSS gratuitos (Reuters, BBC, NYT, TechCrunch, Bloomberg-vía-CNBC, Diario Financiero, La Tercera Pulso, etc.) y, opcionalmente, [NewsAPI](https://newsapi.org/).
2. **Filtra determinísticamente** antes de tocar IA:
   - Frescura (≤ 36h por defecto)
   - Exclusión por keywords (farándula, deportes, crónica roja, opinión, regulación chilena)
   - Deduplicación exacta + por similitud Jaccard de títulos
   - Balance INT / CL
3. **Resume con OpenAI** (modelo barato por defecto: `gpt-4o-mini`) en 400-600 palabras con el formato fijo abajo.
4. **Envía por Gmail** (SMTP + App Password) con HTML simple y texto plano.

### Formato del mail

```
Asunto: Briefing diario — Noticias clave — [fecha]

🌍 INTERNACIONAL                       (máx 5)
- Título / Qué pasó / Por qué importa

🇨🇱 CHILE                              (máx 5)
- Título / Qué pasó / Por qué importa

📊 ECONOMÍA Y MERCADOS                 (3-4 insights)

🧠 INSIGHT DEL DÍA                     (1 tendencia)

🚀 OPORTUNIDAD / RIESGO                (1 + 1)
```

---

## Estructura del repo

```
.
├── .github/workflows/daily-briefing.yml   # Cron de GitHub Actions
├── src/
│   ├── fetchNews.js          # RSS + NewsAPI
│   ├── filterNews.js         # Filtros y dedupe deterministicos
│   ├── summarizeBriefing.js  # Llamada al modelo
│   ├── sendEmail.js          # Gmail SMTP
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

Esto recolecta, filtra, llama al modelo e imprime el briefing en consola, sin tocar Gmail.

### Ejecutar de verdad

```bash
npm start
```

---

## Configuración de secrets

### En GitHub (recomendado para el cron en la nube)

Ir a tu repo → **Settings → Secrets and variables → Actions → New repository secret** y crear:

| Secret                | Obligatorio | Descripción                                                                                |
| --------------------- | :---------: | ------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`      |      ✅     | Clave de OpenAI ([generar aquí](https://platform.openai.com/api-keys)).                    |
| `GMAIL_USER`          |      ✅     | Tu correo Gmail completo (`tu.cuenta@gmail.com`).                                          |
| `GMAIL_APP_PASSWORD`  |      ✅     | App Password de 16 caracteres ([generar](https://myaccount.google.com/apppasswords)).      |
| `NEWS_API_KEY`        |    opcional | Clave de [NewsAPI](https://newsapi.org/). Si la dejas vacía, igual funciona solo con RSS.  |
| `EMAIL_TO`            |    opcional | Destinatario del briefing. Si vacío, se envía a `GMAIL_USER`.                              |

> **Nota Gmail:** debes tener **verificación en dos pasos activada** y luego generar un *App Password*. El password normal de Gmail **no funciona** con SMTP.

#### Variable opcional para cambiar de modelo

En **Settings → Secrets and variables → Actions → Variables**:

| Variable        | Default        | Para qué sirve                                  |
| --------------- | -------------- | ----------------------------------------------- |
| `OPENAI_MODEL`  | `gpt-4o-mini`  | Cambia el modelo sin tocar código (`gpt-4.1-mini`, `gpt-4o`, etc.). |

### En local (`.env`)

Mismas variables, pero en un archivo `.env` (ver `.env.example`). **Nunca** lo commitees.

---

## Programación: 07:00 hora Chile

GitHub Actions corre en **UTC**. Chile observa horario de verano:

| Estación  | Offset Chile | Cron UTC para 07:00 CL |
| --------- | :----------: | :--------------------: |
| Verano    | UTC-3        | `0 10 * * *`           |
| Invierno  | UTC-4        | `0 11 * * *`           |

Para no tener que tocar el repo dos veces al año, el workflow **programa ambas crons** y un step previo (`Skip if not 07:00 Chile time`) descarta la corrida que no corresponda usando `TZ=America/Santiago`. Resultado: el briefing siempre se ejecuta a las **07:00 hora Chile**.

> Si por algún motivo Chile cambia su política de DST, basta con ajustar las dos líneas `cron:` en `.github/workflows/daily-briefing.yml`.

### Disparo manual

En la pestaña **Actions → Daily News Briefing → Run workflow** puedes lanzarlo en cualquier momento (esto **omite el chequeo de hora**, ideal para test).

### Alternativa: cron local

Si prefieres correrlo en una máquina propia / VPS:

```cron
# crontab -e
0 7 * * *  cd /ruta/al/repo && TZ=America/Santiago /usr/bin/node src/index.js >> briefing.log 2>&1
```

`TZ=America/Santiago` hace que `0 7` sea 07:00 Chile sin importar UTC ni DST.

---

## Optimización de costos

| Optimización                                       | Dónde se aplica                          |
| -------------------------------------------------- | ---------------------------------------- |
| Filtro determinístico antes de IA                  | `filterNews.js` (keywords + frescura)    |
| Dedupe exacto + similitud Jaccard de títulos       | `filterNews.js`                          |
| Cap a `MAX_NEWS_TO_MODEL` (default 40)             | `index.js` → `pickTop`                   |
| Modelo barato por defecto                          | `OPENAI_MODEL=gpt-4o-mini`               |
| Modelo cambiable vía env                           | Variable `OPENAI_MODEL`                  |
| Briefing acotado a 400-600 palabras                | `summarizeBriefing.js` system prompt     |
| `temperature: 0.2` y `max_tokens: 1500`            | `summarizeBriefing.js`                   |

Logs en cada corrida muestran:

```
[fetch]   RSS: 312 items
[fetch] Total recolectado: 342 items
[filter] 342 -> 87 tras dedupe + exclusión + frescura
[filter] Enviando al modelo: 40 (INT=26, CL=14)
[summarize]   ok en 4123ms — tokens: prompt=2812 comp=701
```

Con esos volúmenes y `gpt-4o-mini`, el **costo por corrida es menor a USD $0.01**.

---

## Personalización rápida

- **Quitar / añadir fuentes RSS**: editar `RSS_SOURCES` en `src/fetchNews.js`.
- **Más / menos categorías excluidas**: editar `EXCLUDE_KEYWORDS` en `src/filterNews.js`.
- **Cambiar formato del mail**: el system prompt está en `src/summarizeBriefing.js`.
- **Cambiar destinatario**: setear `EMAIL_TO` en secrets (o `.env`).

---

## Troubleshooting

| Síntoma                                            | Posible causa / solución                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `OPENAI_API_KEY no está configurada`               | Falta secret en GitHub o variable en `.env`.                              |
| `Invalid login: 535-5.7.8 ... Username and Password not accepted` | No estás usando un **App Password** de Gmail.                  |
| El mail no llega y los logs muestran `enviado: <id>` | Revisar Spam, o que `EMAIL_TO` esté bien escrito.                       |
| Faltan noticias de Chile                           | Algunos RSS chilenos caen ocasionalmente; revisa logs `[warn] RSS falló`. |
| Demasiadas noticias repetidas                      | Bajar el umbral de Jaccard en `filterNews.js` (actualmente 0.6).          |

---

## Licencia

MIT.
