import nodemailer from 'nodemailer';

// ---------------------------------------------------------------
// Render Markdown -> HTML responsive y legible en celular.
// Soporta:
//   # H1, ## H2, ### H3
//   párrafos
//   bullets (- ...)
//   **negritas** y *cursivas*
//   líneas INDICATOR|label|valor|fecha|contexto|fuente -> tabla
// ---------------------------------------------------------------

const READING_WPM = 200;

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  // Links Markdown [texto](url)
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a href="$2" style="color:#1f4e8c; text-decoration:none; border-bottom:1px solid #c9d6e6;">$1</a>');
  return s;
}

function renderIndicatorTable(rows) {
  if (!rows.length) return '';
  const tbody = rows.map((r) => {
    const change = r.value || '';
    const isUp = /\+\d/.test(change);
    const isDown = /-\d/.test(change);
    const valueColor = isUp ? '#0a7a3b' : (isDown ? '#a3262a' : '#222');
    return `
      <tr>
        <td style="padding:10px 8px; border-bottom:1px solid #ececec; vertical-align:top;">
          <div style="font-weight:600; color:#111; font-size:14px;">${escapeHtml(r.label)}</div>
          <div style="color:#666; font-size:12px; margin-top:2px;">${escapeHtml(r.context || '')}</div>
        </td>
        <td style="padding:10px 8px; border-bottom:1px solid #ececec; vertical-align:top; text-align:right; white-space:nowrap;">
          <div style="font-weight:600; font-size:14px; color:${valueColor};">${escapeHtml(r.value || '')}</div>
          <div style="color:#888; font-size:11px; margin-top:2px;">${escapeHtml(r.date || '')}${r.source ? ' · ' + escapeHtml(r.source) : ''}</div>
        </td>
      </tr>`;
  }).join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin:12px 0 18px 0; background:#fafbfc; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <tbody>${tbody}</tbody>
    </table>`;
}

function parseIndicatorLine(line) {
  // INDICATOR|label|value|date|context|source
  const parts = line.split('|').map((p) => p.trim());
  if (parts[0] !== 'INDICATOR' || parts.length < 6) return null;
  return {
    label: parts[1],
    value: parts[2],
    date: parts[3],
    context: parts[4],
    source: parts[5],
  };
}

function readingTime(text) {
  const words = text.trim().split(/\s+/).length;
  const min = Math.max(1, Math.round(words / READING_WPM));
  return { words, min };
}

function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inUl = false;
  let pendingIndicators = [];

  const flushUl = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
  };
  const flushIndicators = () => {
    if (pendingIndicators.length) {
      out.push(renderIndicatorTable(pendingIndicators));
      pendingIndicators = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    // Indicator row
    if (trimmed.startsWith('INDICATOR|')) {
      flushUl();
      const ind = parseIndicatorLine(trimmed);
      if (ind) pendingIndicators.push(ind);
      continue;
    }

    // Cualquier otra línea cierra el bloque pendiente de indicadores
    if (pendingIndicators.length && trimmed) flushIndicators();

    if (!trimmed) {
      flushUl();
      flushIndicators();
      out.push('');
      continue;
    }

    // Encabezados
    if (/^#\s+/.test(trimmed)) {
      flushUl();
      out.push(`<h1 class="briefing-h1" style="font-size:22px; line-height:1.25; margin:0 0 8px 0; color:#0a0a0a; letter-spacing:-0.01em;">${renderInline(trimmed.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      flushUl();
      const text = trimmed.replace(/^##\s+/, '');
      out.push(`<h2 class="briefing-h2" style="font-size:17px; line-height:1.3; margin:28px 0 10px 0; padding-bottom:6px; border-bottom:2px solid #0a0a0a; color:#0a0a0a;">${renderInline(text)}</h2>`);
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushUl();
      const text = trimmed.replace(/^###\s+/, '');
      out.push(`<h3 class="briefing-h3" style="font-size:15px; line-height:1.35; margin:18px 0 6px 0; color:#1a1a1a; font-weight:700;">${renderInline(text)}</h3>`);
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!inUl) {
        out.push('<ul style="margin:8px 0 14px 0; padding-left:20px; color:#222;">');
        inUl = true;
      }
      out.push(`<li style="margin:6px 0; line-height:1.5;">${renderInline(bulletMatch[2])}</li>`);
      continue;
    }

    flushUl();
    out.push(`<p style="margin:8px 0 12px 0; line-height:1.6; color:#1f1f1f; font-size:15px;">${renderInline(trimmed)}</p>`);
  }

  flushUl();
  flushIndicators();

  return out.join('\n');
}

function buildHtml({ markdown, dateLabel }) {
  const body = markdownToHtml(markdown);
  const { words, min } = readingTime(markdown);

  // Outlook desktop (motor Word) ignora max-width, border-radius, box-shadow y
  // @media queries. Para que igual se vea decente usamos conditional comments
  // MSO con una tabla de ancho fijo. El resto de clientes lo ignora.
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Briefing diario — ${escapeHtml(dateLabel)}</title>
<!--[if mso]>
<style type="text/css">
  table, td, div, p, h1, h2, h3, ul, li { font-family: 'Segoe UI', Arial, sans-serif !important; }
  h2 { mso-line-height-rule: exactly; }
</style>
<xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style>
  /* Modo móvil: sólo lo usan clientes web/iOS/Android. Outlook desktop lo ignora. */
  @media (max-width: 600px) {
    .container { padding: 16px !important; }
    .briefing-h1 { font-size: 20px !important; }
    .briefing-h2 { font-size: 16px !important; }
    .briefing-h3 { font-size: 14px !important; }
    table { font-size: 13px !important; }
  }
  /* Modo oscuro: forzamos colores legibles para que Outlook/iOS no inviertan. */
  @media (prefers-color-scheme: dark) {
    body, .card { background:#ffffff !important; color:#1f1f1f !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#f4f5f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#1f1f1f;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="680" style="width:680px;">
          <tr><td>
        <![endif]-->
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="680" class="card" style="width:100%; max-width:680px; background:#ffffff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td class="container" style="padding:28px 32px;">
              <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#888; margin-bottom:6px;">Briefing editorial</div>
              <div style="font-size:12px; color:#888; margin-bottom:18px;">Lectura estimada: ${min} min · ${words.toLocaleString('es-CL')} palabras</div>
              ${body}
              <hr style="margin:28px 0 14px 0; border:none; border-top:1px solid #e5e7eb;" />
              <p style="font-size:11px; color:#888; line-height:1.5; margin:0;">
                Generado automáticamente por <code style="background:#f3f4f6; padding:1px 4px; border-radius:3px;">daily-news-briefing</code>.
                Indicadores: mindicador.cl (Banco Central de Chile / SII) y stooq.com.
                Noticias: feeds RSS de medios oficiales (Reuters, BBC, NYT, FT, WSJ, Diario Financiero, La Tercera, BioBio, Emol, Ex-Ante, entre otros).
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
          </td></tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ user, appPassword, to, subject, markdown, dateLabel = '' }) {
  if (!user || !appPassword) throw new Error('GMAIL_USER y GMAIL_APP_PASSWORD son requeridos.');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
  });

  const html = buildHtml({ markdown, dateLabel });

  console.log(`[email] Enviando a ${to || user}...`);
  const info = await transporter.sendMail({
    from: `"Daily Briefing" <${user}>`,
    to: to || user,
    subject,
    text: markdown,
    html,
  });
  console.log(`[email]   enviado: ${info.messageId}`);
  return info;
}

// Exportado para tests / dry-run que quieran ver el HTML sin enviar.
export function renderEmailHtml({ markdown, dateLabel = '' }) {
  return buildHtml({ markdown, dateLabel });
}
