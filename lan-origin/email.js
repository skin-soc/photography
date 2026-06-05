/**
 * Branded, theme-aware transactional email templates.
 *
 * Design goals:
 *  - Brand identity: a brand-red (#931020) header band with the white logo, so
 *    the masthead reads identically regardless of the client's light/dark theme.
 *  - Legible in light AND dark mode: inline styles give every client a correct
 *    light rendering; a `prefers-color-scheme: dark` block (plus the Outlook.com
 *    [data-ogsc] hooks) restyles the body for clients that honour <style>.
 *  - Localised into all 17 shop locales, with a plain-text alternative.
 *
 * The logo is supplied by the caller as a CID attachment (PNG), since SVG and
 * most remote images are stripped/blocked by mail clients.
 */

const BRAND = '#931020'        // primary
const BRAND_LIGHT = '#e0566a'  // accent for dark backgrounds

// ── Localised strings ─────────────────────────────────────────────────────────
// {date} is substituted in `validUntil`. Keep these short and warm.
const M = {
  en: { subject: 'Your downloads', preheader: 'Your files are ready to download.', heading: 'Thank you for your purchase.', body: 'Your files are ready. Open the page below and enter your passcode to download them.', cta: 'Open your downloads', passcode: 'Passcode', files: 'Your files', validUntil: 'This link is valid until {date}.', help: 'Having trouble? Just reply to this email and we’ll help.' },
  da: { subject: 'Dine downloads', preheader: 'Dine filer er klar til download.', heading: 'Tak for dit køb.', body: 'Dine filer er klar. Åbn siden nedenfor, og indtast din adgangskode for at downloade dem.', cta: 'Åbn dine downloads', passcode: 'Adgangskode', files: 'Dine filer', validUntil: 'Dette link er gyldigt indtil {date}.', help: 'Problemer? Svar bare på denne e-mail, så hjælper vi.' },
  de: { subject: 'Ihre Downloads', preheader: 'Ihre Dateien stehen zum Download bereit.', heading: 'Vielen Dank für Ihren Einkauf.', body: 'Ihre Dateien sind bereit. Öffnen Sie die Seite unten und geben Sie Ihren Zugangscode ein, um sie herunterzuladen.', cta: 'Ihre Downloads öffnen', passcode: 'Zugangscode', files: 'Ihre Dateien', validUntil: 'Dieser Link ist gültig bis {date}.', help: 'Probleme? Antworten Sie einfach auf diese E-Mail, und wir helfen Ihnen.' },
  es: { subject: 'Tus descargas', preheader: 'Tus archivos están listos para descargar.', heading: 'Gracias por tu compra.', body: 'Tus archivos están listos. Abre la página de abajo e introduce tu código de acceso para descargarlos.', cta: 'Abrir tus descargas', passcode: 'Código de acceso', files: 'Tus archivos', validUntil: 'Este enlace es válido hasta el {date}.', help: '¿Algún problema? Responde a este correo y te ayudaremos.' },
  fr: { subject: 'Vos téléchargements', preheader: 'Vos fichiers sont prêts à être téléchargés.', heading: 'Merci pour votre achat.', body: "Vos fichiers sont prêts. Ouvrez la page ci-dessous et saisissez votre code d'accès pour les télécharger.", cta: 'Ouvrir vos téléchargements', passcode: "Code d'accès", files: 'Vos fichiers', validUntil: "Ce lien est valable jusqu'au {date}.", help: 'Un problème ? Répondez simplement à cet e-mail et nous vous aiderons.' },
  it: { subject: 'I tuoi download', preheader: 'I tuoi file sono pronti per il download.', heading: 'Grazie per il tuo acquisto.', body: 'I tuoi file sono pronti. Apri la pagina qui sotto e inserisci il tuo codice di accesso per scaricarli.', cta: 'Apri i tuoi download', passcode: 'Codice di accesso', files: 'I tuoi file', validUntil: 'Questo link è valido fino al {date}.', help: 'Problemi? Rispondi a questa e-mail e ti aiuteremo.' },
  nl: { subject: 'Je downloads', preheader: 'Je bestanden staan klaar om te downloaden.', heading: 'Bedankt voor je aankoop.', body: 'Je bestanden staan klaar. Open de pagina hieronder en voer je toegangscode in om ze te downloaden.', cta: 'Open je downloads', passcode: 'Toegangscode', files: 'Je bestanden', validUntil: 'Deze link is geldig tot {date}.', help: 'Problemen? Beantwoord deze e-mail en we helpen je.' },
  nb: { subject: 'Nedlastingene dine', preheader: 'Filene dine er klare til nedlasting.', heading: 'Takk for kjøpet.', body: 'Filene dine er klare. Åpne siden nedenfor og skriv inn tilgangskoden din for å laste dem ned.', cta: 'Åpne nedlastingene dine', passcode: 'Tilgangskode', files: 'Filene dine', validUntil: 'Denne lenken er gyldig til {date}.', help: 'Problemer? Bare svar på denne e-posten, så hjelper vi deg.' },
  pl: { subject: 'Twoje pobrania', preheader: 'Twoje pliki są gotowe do pobrania.', heading: 'Dziękujemy za zakup.', body: 'Twoje pliki są gotowe. Otwórz poniższą stronę i wprowadź kod dostępu, aby je pobrać.', cta: 'Otwórz swoje pobrania', passcode: 'Kod dostępu', files: 'Twoje pliki', validUntil: 'Ten link jest ważny do {date}.', help: 'Masz problem? Po prostu odpowiedz na tę wiadomość, a pomożemy.' },
  pt: { subject: 'As suas transferências', preheader: 'Os seus ficheiros estão prontos para transferir.', heading: 'Obrigado pela sua compra.', body: 'Os seus ficheiros estão prontos. Abra a página abaixo e introduza o seu código de acesso para os transferir.', cta: 'Abrir as suas transferências', passcode: 'Código de acesso', files: 'Os seus ficheiros', validUntil: 'Este link é válido até {date}.', help: 'Algum problema? Responda a este e-mail e ajudamos.' },
  fi: { subject: 'Latauksesi', preheader: 'Tiedostosi ovat valmiina ladattaviksi.', heading: 'Kiitos ostoksestasi.', body: 'Tiedostosi ovat valmiina. Avaa alla oleva sivu ja syötä pääsykoodisi ladataksesi ne.', cta: 'Avaa latauksesi', passcode: 'Pääsykoodi', files: 'Tiedostosi', validUntil: 'Tämä linkki on voimassa {date} asti.', help: 'Ongelmia? Vastaa tähän viestiin, niin autamme.' },
  sv: { subject: 'Dina nedladdningar', preheader: 'Dina filer är klara att laddas ner.', heading: 'Tack för ditt köp.', body: 'Dina filer är klara. Öppna sidan nedan och ange din åtkomstkod för att ladda ner dem.', cta: 'Öppna dina nedladdningar', passcode: 'Åtkomstkod', files: 'Dina filer', validUntil: 'Den här länken är giltig till {date}.', help: 'Problem? Svara bara på det här mejlet så hjälper vi dig.' },
  ar: { subject: 'تنزيلاتك', preheader: 'ملفاتك جاهزة للتنزيل.', heading: 'شكرًا لشرائك.', body: 'ملفاتك جاهزة. افتح الصفحة أدناه وأدخل رمز الدخول لتنزيلها.', cta: 'افتح تنزيلاتك', passcode: 'رمز الدخول', files: 'ملفاتك', validUntil: 'هذا الرابط صالح حتى {date}.', help: 'هل تواجه مشكلة؟ ما عليك سوى الرد على هذا البريد وسنساعدك.' },
  ru: { subject: 'Ваши загрузки', preheader: 'Ваши файлы готовы к загрузке.', heading: 'Спасибо за покупку.', body: 'Ваши файлы готовы. Откройте страницу ниже и введите код доступа, чтобы скачать их.', cta: 'Открыть загрузки', passcode: 'Код доступа', files: 'Ваши файлы', validUntil: 'Эта ссылка действительна до {date}.', help: 'Возникли проблемы? Просто ответьте на это письмо, и мы поможем.' },
  zh: { subject: '您的下载', preheader: '您的文件已可下载。', heading: '感谢您的购买。', body: '您的文件已准备就绪。打开下方页面并输入访问码即可下载。', cta: '打开您的下载', passcode: '访问码', files: '您的文件', validUntil: '此链接在 {date} 之前有效。', help: '遇到问题？直接回复此邮件，我们会帮助您。' },
  ja: { subject: 'ダウンロードのご案内', preheader: 'ファイルをダウンロードいただけます。', heading: 'ご購入ありがとうございます。', body: 'ファイルの準備ができました。下のページを開き、パスコードを入力してダウンロードしてください。', cta: 'ダウンロードを開く', passcode: 'パスコード', files: 'あなたのファイル', validUntil: 'このリンクは {date} まで有効です。', help: '問題がありますか？このメールにご返信ください。サポートいたします。' },
  ko: { subject: '다운로드 안내', preheader: '파일을 다운로드할 수 있습니다.', heading: '구매해 주셔서 감사합니다.', body: '파일이 준비되었습니다. 아래 페이지를 열고 접근 코드를 입력하여 다운로드하세요.', cta: '다운로드 열기', passcode: '접근 코드', files: '내 파일', validUntil: '이 링크는 {date}까지 유효합니다.', help: '문제가 있나요? 이 이메일에 답장해 주시면 도와드리겠습니다.' },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Render the download email.
 * @returns {{subject:string, text:string, html:string}}
 */
function renderDownloadEmail({ locale, brandName, url, passcode, items, expiryText, copyright, logoCid }) {
  const t = M[locale] || M.en
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = dir === 'rtl' ? 'right' : 'left'
  const startAlign = dir === 'rtl' ? 'right' : 'left'
  const endAlign = dir === 'rtl' ? 'left' : 'right'
  const arrow = dir === 'rtl' ? '&larr;' : '&rarr;'
  const validUntil = t.validUntil.replace('{date}', expiryText)

  // ── Plain-text alternative ──
  const text =
    `${t.heading}\n\n` +
    `${t.body}\n\n` +
    `${t.cta}: ${url}\n` +
    `${t.passcode}: ${passcode}\n\n` +
    `${t.files}:\n` +
    items.map((i) => `  • ${i.label} — ${i.filename}`).join('\n') + `\n\n` +
    `${validUntil}\n\n` +
    `${t.help}\n\n` +
    `${copyright}\n`

  // ── HTML ──
  const fileRows = items.map((i) =>
    `<tr><td class="filerow text" style="padding:11px 14px;border:1px solid #ececec;background:#fafafa;color:#1a1a1a;font-size:14px;">` +
      `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${BRAND};">${esc(i.filename)}</span>` +
      `<span class="muted" style="color:#666;font-size:12px;"> &nbsp;·&nbsp; ${esc(i.label)}${i.format === 'tiff' ? ' · 16-bit TIFF' : ' · JPEG'}</span>` +
    `</td></tr><tr><td style="height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>`
  ).join('')

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body,.wrap { margin:0; padding:0; background:#f1f1f1; }
  .card { background:#ffffff; }
  .text { color:#1a1a1a; }
  .muted { color:#666666; }
  .subtle { color:#9a9a9a; }
  .rule { background:#e6e6e6; }
  .passbox { background:#f6f6f6; border:1px solid #e6e6e6; }
  .passcode { color:${BRAND}; }
  a.cta { background:${BRAND}; color:#ffffff !important; }
  @media (prefers-color-scheme: dark) {
    body,.wrap { background:#0b0b0b !important; }
    .card { background:#141414 !important; }
    .text { color:#f1f1f1 !important; }
    .muted { color:#b9b9b9 !important; }
    .subtle { color:#8a8a8a !important; }
    .rule { background:#2b2b2b !important; }
    .passbox { background:#1d1d1d !important; border-color:#2b2b2b !important; }
    .passcode { color:${BRAND_LIGHT} !important; }
    .filerow { background:#1b1b1b !important; border-color:#2b2b2b !important; color:#f1f1f1 !important; }
  }
  [data-ogsc] .card { background:#141414 !important; }
  [data-ogsc] .text { color:#f1f1f1 !important; }
  [data-ogsc] .muted { color:#b9b9b9 !important; }
  [data-ogsc] .subtle { color:#8a8a8a !important; }
  [data-ogsc] .rule { background:#2b2b2b !important; }
  [data-ogsc] .passbox { background:#1d1d1d !important; border-color:#2b2b2b !important; }
  [data-ogsc] .passcode { color:${BRAND_LIGHT} !important; }
  [data-ogsc] .filerow { background:#1b1b1b !important; border-color:#2b2b2b !important; color:#f1f1f1 !important; }
</style>
</head>
<body class="wrap" style="margin:0;padding:0;background:#f1f1f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="wrap" style="background:#f1f1f1;">
  <tr><td align="center" style="padding:30px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="max-width:520px;width:100%;background:#ffffff;">
      <!-- Slim masthead: logo (start) · wordmark (end) -->
      <tr><td style="padding:26px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}">
          <tr>
            <td align="${startAlign}" valign="middle" style="width:42px;">
              <img src="cid:${logoCid}" width="36" height="36" alt="${esc(brandName)}" style="display:inline-block;border:0;width:36px;height:36px;">
            </td>
            <td align="${endAlign}" valign="middle">
              <span class="muted" style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:400;letter-spacing:0.04em;color:#666;">${esc(brandName)}</span>
            </td>
          </tr>
        </table>
      </td></tr>
      <!-- Hairline divider -->
      <tr><td style="padding:20px 32px 0;">
        <div class="rule" style="height:1px;line-height:1px;font-size:1px;background:#e6e6e6;">&nbsp;</div>
      </td></tr>
      <!-- Body -->
      <tr><td class="card text" dir="${dir}" style="background:#ffffff;padding:28px 32px 34px;text-align:${align};color:#1a1a1a;">
        <h1 class="text" style="margin:0 0 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:600;color:#1a1a1a;">${esc(t.heading)}</h1>
        <p class="muted" style="margin:0 0 24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#666;">${esc(t.body)}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
          <tr><td style="background:${BRAND};">
            <a class="cta" href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(t.cta)} ${arrow}</a>
          </td></tr>
        </table>

        <!-- Passcode -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
          <tr><td class="passbox" style="background:#f6f6f6;border:1px solid #e6e6e6;padding:14px 16px;text-align:${align};">
            <div class="subtle" style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9a9a9a;margin:0 0 4px;">${esc(t.passcode)}</div>
            <div class="passcode" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:0.22em;color:${BRAND};">${esc(passcode)}</div>
          </td></tr>
        </table>

        <!-- Files -->
        <div class="subtle" style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#9a9a9a;margin:0 0 12px;">${esc(t.files)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${fileRows}</table>

        <p class="subtle" style="margin:18px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#9a9a9a;">${esc(validUntil)}</p>
        <p class="muted" style="margin:22px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#666;">${esc(t.help)}</p>
      </td></tr>
    </table>
    <!-- Footer — outside the card, on the page background -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td align="center" style="padding:18px 24px 0;">
        <p class="subtle" style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#9a9a9a;">${esc(copyright)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  return { subject: `${t.subject} — ${brandName}`, text, html }
}

export { renderDownloadEmail }
