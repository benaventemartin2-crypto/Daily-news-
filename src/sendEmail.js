import nodemailer from 'nodemailer';

function markdownToHtml(md) {
  // Conversor mínimo: encabezados emoji, bullets, negritas, saltos.
  const escape = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeList(); out.push(''); continue; }

    // Encabezados con emoji al inicio (las secciones del briefing)
    if (/^(🌍|🇨🇱|📊|🧠|🚀)/.test(line)) {
      closeList();
      out.push(`<h3 style="margin:20px 0 8px 0; font-family:system-ui,sans-serif;">${escape(line)}</h3>`);
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) { out.push('<ul style="margin:0 0 0 18px; padding:0;">'); inList = true; }
      let content = escape(bulletMatch[2]);
      content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      const indent = bulletMatch[1].length;
      const style = indent > 0 ? ' style="margin-left:14px; list-style:circle;"' : '';
      out.push(`<li${style}>${content}</li>`);
      continue;
    }

    closeList();
    let content = escape(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out.push(`<p style="margin:6px 0;">${content}</p>`);
  }
  closeList();

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif; color:#222; max-width:720px; margin:0 auto; padding:20px; line-height:1.45;">
${out.join('\n')}
<hr style="margin-top:28px; border:none; border-top:1px solid #ddd;" />
<p style="font-size:12px; color:#888;">Generado automáticamente por <code>daily-news-briefing</code>.</p>
</body></html>`;
}

export async function sendEmail({ user, appPassword, to, subject, markdown }) {
  if (!user || !appPassword) throw new Error('GMAIL_USER y GMAIL_APP_PASSWORD son requeridos.');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
  });

  const html = markdownToHtml(markdown);

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
