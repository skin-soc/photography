/**
 * VAT-compliant receipt + licence PDF generation (origin-side).
 *
 * `buildInvoicePdf` → a single-page RECEIPT. Because an order only exists once it
 * has been PAID IN FULL (Stripe fulfils on payment_status = 'paid'), the document
 * states the payment date, method and a "PAID IN FULL" mark, and carries no
 * payment terms / amount due. Localised into the buyer's language.
 *
 * `buildLicensePdf` → a standalone licensing Terms & Conditions document in the
 * buyer's language, from the snapshot stored on the grant at purchase time
 * (grant.terms). Emailed and downloadable alongside the receipt.
 *
 * VAT cases handled: standard-rated (B2C / DK business), intra-EU B2B reverse
 * charge (0% + Art. 196 note + VIES consultation number) and outside-EU (0%).
 *
 * The embedded Noto Sans font covers Latin + Cyrillic + Greek; CJK/Arabic locales
 * fall back to English for both the chrome and the terms (the font can't render
 * those scripts; English is the governing-law language). SELLER identity is fixed
 * (mirrors src/lib/seller.ts on the Worker side).
 */

import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { existsSync } from 'node:fs'

export const SELLER = {
  name: 'Gus McEwan Photography',
  vat: 'DK34922993',
  cvr: '34922993',
  addressLines: ['Ryesgade 62', '2100 København Ø', 'Denmark'],
  // MAIL_FROM is often a full mail header ("Name <addr>"); keep just the address.
  email: (process.env.MAIL_FROM || 'email@gusmcewan.com').replace(/^.*</, '').replace(/>.*$/, '').trim(),
  website: 'https://gusmcewan.com',
}

const STAMP_INK = '#931020' // brand red — used for the receipt tag + paid stamp

// Brand logo. PDFKit embeds PNG/JPEG only (not SVG), so we rasterise logo.svg
// once at load via sharp and reuse the buffer. Intrinsic ratio 1320×1000 = 1.32.
const LOGO_ASPECT = 1320 / 1000
const LOGO_SVG_PATH = new URL('./logo.svg', import.meta.url).pathname
let LOGO_PNG = null
try {
  LOGO_PNG = await sharp(LOGO_SVG_PATH, { density: 300 }).resize({ height: 200 }).png().toBuffer()
} catch (err) {
  console.warn('[invoice] logo rasterisation failed — documents will print without it:', err.message)
}

// Unicode fonts (installed via `fonts-noto-core` + `fonts-noto-cjk`). PDFKit's
// built-in Helvetica only covers Latin-1, so we embed Noto:
//   NotoSans       (truetype) → Latin + Cyrillic + Greek  → 13 locales
//   NotoSansCJK    (opentype) → Chinese / Japanese / Korean — one .ttc holding
//                  language-specific sub-fonts, picked by PostScript name; these
//                  also include Latin glyphs, so a CJK page's prices/codes render.
// Fonts are subset by fontkit, so embedding stays small despite the big sources.
const NOTO_REGULAR = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
const NOTO_BOLD = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
const NOTO_ITALIC = '/usr/share/fonts/truetype/noto/NotoSans-Italic.ttf'
const HAS_NOTO = existsSync(NOTO_REGULAR) && existsSync(NOTO_BOLD)
const CJK_REGULAR = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
const CJK_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
// locale → PostScript sub-font family inside the CJK .ttc (sc/jp/kr differ in
// Han glyph shapes, so we pick the right one per language).
const CJK_PS = { zh: 'NotoSansCJKsc', ja: 'NotoSansCJKjp', ko: 'NotoSansCJKkr' }

// ── Localised invoice/receipt chrome ──────────────────────────────────────────
// Arabic is the only locale we can't render: PDFKit has no RTL/bidi reordering,
// so Arabic would come out mis-ordered. It falls back to English (governing-law
// language). Everything else — incl. CJK — is localized natively.
const NON_LATIN = new Set(['ar'])
const BCP47 = { en: 'en-GB', nb: 'nb-NO', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' }

const INVOICE_STRINGS = {
  en: { title: 'INVOICE', receiptTag: 'RECEIPT — PAID', no: 'No.', date: 'Date', order: 'Order', paid: 'Paid', billTo: 'BILL TO', customer: 'Customer', description: 'DESCRIPTION', amount: 'AMOUNT', discount: 'Discount', subtotal: 'Subtotal (net)', vat: 'VAT', reverseChargeShort: 'reverse charge', total: 'Total', amountPaid: 'Amount paid', balanceDue: 'Balance due', paidInFull: 'PAID', outsideEu: 'Sale outside the scope of EU VAT.', testBanner: 'TEST ORDER — NOT A VALID INVOICE', testNo: 'TEST — not a valid invoice', viesRef: 'VIES consultation no.', reverseChargeNote: 'Reverse charge — VAT to be accounted for by the recipient (Article 196 of Council Directive 2006/112/EC). Customer VAT: {vat}.' },
  da: { title: 'FAKTURA', receiptTag: 'KVITTERING — BETALT', no: 'Nr.', date: 'Dato', order: 'Ordre', paid: 'Betalt', billTo: 'FAKTURERES TIL', customer: 'Kunde', description: 'BESKRIVELSE', amount: 'BELØB', discount: 'Rabat', subtotal: 'Subtotal (netto)', vat: 'Moms', reverseChargeShort: 'omvendt betalingspligt', total: 'I alt', amountPaid: 'Betalt beløb', balanceDue: 'Skyldigt beløb', paidInFull: 'BETALT', outsideEu: 'Salg uden for EU’s momsområde.', testBanner: 'TESTORDRE — IKKE EN GYLDIG FAKTURA', testNo: 'TEST — ikke en gyldig faktura', viesRef: 'VIES-konsultationsnr.', reverseChargeNote: 'Omvendt betalingspligt — momsen afregnes af modtageren (artikel 196 i Rådets direktiv 2006/112/EF). Kundens momsnr.: {vat}.' },
  de: { title: 'RECHNUNG', receiptTag: 'QUITTUNG — BEZAHLT', no: 'Nr.', date: 'Datum', order: 'Bestellung', paid: 'Bezahlt', billTo: 'RECHNUNG AN', customer: 'Kunde', description: 'BESCHREIBUNG', amount: 'BETRAG', discount: 'Rabatt', subtotal: 'Zwischensumme (netto)', vat: 'USt.', reverseChargeShort: 'Reverse-Charge', total: 'Gesamt', amountPaid: 'Bezahlter Betrag', balanceDue: 'Offener Betrag', paidInFull: 'BEZAHLT', outsideEu: 'Verkauf außerhalb des Anwendungsbereichs der EU-USt.', testBanner: 'TESTBESTELLUNG — KEINE GÜLTIGE RECHNUNG', testNo: 'TEST — keine gültige Rechnung', viesRef: 'MIAS-Konsultationsnr.', reverseChargeNote: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge) — die USt. schuldet der Empfänger (Artikel 196 der Richtlinie 2006/112/EG). USt-IdNr. des Kunden: {vat}.' },
  es: { title: 'FACTURA', receiptTag: 'RECIBO — PAGADO', no: 'N.º', date: 'Fecha', order: 'Pedido', paid: 'Pagado', billTo: 'FACTURAR A', customer: 'Cliente', description: 'DESCRIPCIÓN', amount: 'IMPORTE', discount: 'Descuento', subtotal: 'Subtotal (neto)', vat: 'IVA', reverseChargeShort: 'inversión del sujeto pasivo', total: 'Total', amountPaid: 'Importe pagado', balanceDue: 'Saldo pendiente', paidInFull: 'PAGADO', outsideEu: 'Venta fuera del ámbito del IVA de la UE.', testBanner: 'PEDIDO DE PRUEBA — NO ES UNA FACTURA VÁLIDA', testNo: 'PRUEBA — no es una factura válida', viesRef: 'N.º de consulta VIES', reverseChargeNote: 'Inversión del sujeto pasivo — el IVA debe ser liquidado por el destinatario (artículo 196 de la Directiva 2006/112/CE). NIF-IVA del cliente: {vat}.' },
  fr: { title: 'FACTURE', receiptTag: 'REÇU — PAYÉ', no: 'N°', date: 'Date', order: 'Commande', paid: 'Payé', billTo: 'FACTURÉ À', customer: 'Client', description: 'DESCRIPTION', amount: 'MONTANT', discount: 'Remise', subtotal: 'Sous-total (net)', vat: 'TVA', reverseChargeShort: 'autoliquidation', total: 'Total', amountPaid: 'Montant payé', balanceDue: 'Solde dû', paidInFull: 'PAYÉ', outsideEu: 'Vente hors du champ d’application de la TVA de l’UE.', testBanner: 'COMMANDE DE TEST — FACTURE NON VALIDE', testNo: 'TEST — facture non valide', viesRef: 'N° de consultation VIES', reverseChargeNote: 'Autoliquidation — TVA due par le preneur (article 196 de la directive 2006/112/CE). N° de TVA du client : {vat}.' },
  it: { title: 'FATTURA', receiptTag: 'RICEVUTA — PAGATA', no: 'N.', date: 'Data', order: 'Ordine', paid: 'Pagato', billTo: 'FATTURARE A', customer: 'Cliente', description: 'DESCRIZIONE', amount: 'IMPORTO', discount: 'Sconto', subtotal: 'Subtotale (netto)', vat: 'IVA', reverseChargeShort: 'inversione contabile', total: 'Totale', amountPaid: 'Importo pagato', balanceDue: 'Saldo dovuto', paidInFull: 'PAGATO', outsideEu: 'Vendita fuori dal campo di applicazione dell’IVA UE.', testBanner: 'ORDINE DI PROVA — FATTURA NON VALIDA', testNo: 'PROVA — fattura non valida', viesRef: 'N. consultazione VIES', reverseChargeNote: 'Inversione contabile — IVA assolta dal destinatario (articolo 196 della direttiva 2006/112/CE). P.IVA del cliente: {vat}.' },
  nl: { title: 'FACTUUR', receiptTag: 'KWITANTIE — BETAALD', no: 'Nr.', date: 'Datum', order: 'Bestelling', paid: 'Betaald', billTo: 'FACTUREREN AAN', customer: 'Klant', description: 'OMSCHRIJVING', amount: 'BEDRAG', discount: 'Korting', subtotal: 'Subtotaal (netto)', vat: 'btw', reverseChargeShort: 'verlegd', total: 'Totaal', amountPaid: 'Betaald bedrag', balanceDue: 'Openstaand bedrag', paidInFull: 'BETAALD', outsideEu: 'Verkoop buiten het toepassingsgebied van de EU-btw.', testBanner: 'TESTBESTELLING — GEEN GELDIGE FACTUUR', testNo: 'TEST — geen geldige factuur', viesRef: 'VIES-raadplegingsnr.', reverseChargeNote: 'Btw verlegd — de btw wordt voldaan door de afnemer (artikel 196 van Richtlijn 2006/112/EG). Btw-nr. klant: {vat}.' },
  nb: { title: 'FAKTURA', receiptTag: 'KVITTERING — BETALT', no: 'Nr.', date: 'Dato', order: 'Ordre', paid: 'Betalt', billTo: 'FAKTURERES TIL', customer: 'Kunde', description: 'BESKRIVELSE', amount: 'BELØP', discount: 'Rabatt', subtotal: 'Delsum (netto)', vat: 'MVA', reverseChargeShort: 'omvendt avgiftsplikt', total: 'Totalt', amountPaid: 'Betalt beløp', balanceDue: 'Utestående beløp', paidInFull: 'BETALT', outsideEu: 'Salg utenfor EUs merverdiavgiftsområde.', testBanner: 'TESTORDRE — IKKE EN GYLDIG FAKTURA', testNo: 'TEST — ikke en gyldig faktura', viesRef: 'VIES-konsultasjonsnr.', reverseChargeNote: 'Omvendt avgiftsplikt — mva. skal beregnes av mottakeren (artikkel 196 i direktiv 2006/112/EF). Kundens mva-nr.: {vat}.' },
  pl: { title: 'FAKTURA', receiptTag: 'POTWIERDZENIE — OPŁACONO', no: 'Nr', date: 'Data', order: 'Zamówienie', paid: 'Opłacono', billTo: 'NABYWCA', customer: 'Klient', description: 'OPIS', amount: 'KWOTA', discount: 'Rabat', subtotal: 'Suma częściowa (netto)', vat: 'VAT', reverseChargeShort: 'odwrotne obciążenie', total: 'Razem', amountPaid: 'Kwota zapłacona', balanceDue: 'Pozostało do zapłaty', paidInFull: 'OPŁACONO', outsideEu: 'Sprzedaż poza zakresem VAT UE.', testBanner: 'ZAMÓWIENIE TESTOWE — NIEWAŻNA FAKTURA', testNo: 'TEST — nieważna faktura', viesRef: 'Nr potwierdzenia VIES', reverseChargeNote: 'Odwrotne obciążenie — VAT rozlicza nabywca (artykuł 196 dyrektywy 2006/112/WE). Nr VAT nabywcy: {vat}.' },
  pt: { title: 'FATURA', receiptTag: 'RECIBO — PAGO', no: 'N.º', date: 'Data', order: 'Encomenda', paid: 'Pago', billTo: 'FATURAR A', customer: 'Cliente', description: 'DESCRIÇÃO', amount: 'MONTANTE', discount: 'Desconto', subtotal: 'Subtotal (líquido)', vat: 'IVA', reverseChargeShort: 'autoliquidação', total: 'Total', amountPaid: 'Montante pago', balanceDue: 'Saldo em dívida', paidInFull: 'PAGO', outsideEu: 'Venda fora do âmbito do IVA da UE.', testBanner: 'ENCOMENDA DE TESTE — FATURA INVÁLIDA', testNo: 'TESTE — fatura inválida', viesRef: 'N.º de consulta VIES', reverseChargeNote: 'Autoliquidação — IVA devido pelo adquirente (artigo 196.º da Diretiva 2006/112/CE). N.º de IVA do cliente: {vat}.' },
  fi: { title: 'LASKU', receiptTag: 'KUITTI — MAKSETTU', no: 'Nro', date: 'Päivämäärä', order: 'Tilaus', paid: 'Maksettu', billTo: 'LASKUTETAAN', customer: 'Asiakas', description: 'KUVAUS', amount: 'MÄÄRÄ', discount: 'Alennus', subtotal: 'Välisumma (netto)', vat: 'ALV', reverseChargeShort: 'käännetty verovelvollisuus', total: 'Yhteensä', amountPaid: 'Maksettu määrä', balanceDue: 'Maksettavaa jäljellä', paidInFull: 'MAKSETTU', outsideEu: 'Myynti EU:n arvonlisäveron soveltamisalan ulkopuolella.', testBanner: 'TESTITILAUS — EI KELVOLLINEN LASKU', testNo: 'TESTI — ei kelvollinen lasku', viesRef: 'VIES-kyselynro', reverseChargeNote: 'Käännetty verovelvollisuus — arvonlisäveron tilittää ostaja (neuvoston direktiivin 2006/112/EY 196 artikla). Asiakkaan ALV-numero: {vat}.' },
  sv: { title: 'FAKTURA', receiptTag: 'KVITTO — BETALD', no: 'Nr', date: 'Datum', order: 'Order', paid: 'Betald', billTo: 'FAKTURERAS TILL', customer: 'Kund', description: 'BESKRIVNING', amount: 'BELOPP', discount: 'Rabatt', subtotal: 'Delsumma (netto)', vat: 'Moms', reverseChargeShort: 'omvänd betalningsskyldighet', total: 'Totalt', amountPaid: 'Betalt belopp', balanceDue: 'Utestående belopp', paidInFull: 'BETALD', outsideEu: 'Försäljning utanför EU:s momsområde.', testBanner: 'TESTORDER — INGEN GILTIG FAKTURA', testNo: 'TEST — ingen giltig faktura', viesRef: 'VIES-konsultationsnr.', reverseChargeNote: 'Omvänd betalningsskyldighet — momsen redovisas av köparen (artikel 196 i direktiv 2006/112/EG). Kundens momsnr: {vat}.' },
  ru: { title: 'СЧЁТ', receiptTag: 'КВИТАНЦИЯ — ОПЛАЧЕНО', no: '№', date: 'Дата', order: 'Заказ', paid: 'Оплачено', billTo: 'ПЛАТЕЛЬЩИК', customer: 'Клиент', description: 'ОПИСАНИЕ', amount: 'СУММА', discount: 'Скидка', subtotal: 'Промежуточный итог (нетто)', vat: 'НДС', reverseChargeShort: 'обратное начисление', total: 'Итого', amountPaid: 'Оплаченная сумма', balanceDue: 'Остаток к оплате', paidInFull: 'ОПЛАЧЕНО', outsideEu: 'Продажа вне сферы действия НДС ЕС.', testBanner: 'ТЕСТОВЫЙ ЗАКАЗ — НЕДЕЙСТВИТЕЛЬНЫЙ СЧЁТ', testNo: 'ТЕСТ — недействительный счёт', viesRef: 'Номер консультации VIES', reverseChargeNote: 'Обратное начисление — НДС уплачивается получателем (статья 196 Директивы 2006/112/ЕС). НДС клиента: {vat}.' },
  zh: { title: '发票', receiptTag: '收据 — 已付款', no: '编号', date: '日期', order: '订单', paid: '已付', billTo: '付款方', customer: '客户', description: '项目说明', amount: '金额', discount: '折扣', subtotal: '小计（净额）', vat: '增值税', reverseChargeShort: '反向征收', total: '合计', amountPaid: '已付金额', balanceDue: '应付余额', paidInFull: '已付款', outsideEu: '本次销售不属于欧盟增值税范围。', testBanner: '测试订单 — 非有效发票', testNo: '测试 — 非有效发票', viesRef: 'VIES 咨询编号', reverseChargeNote: '反向征收 — 增值税由接收方申报缴纳（理事会指令 2006/112/EC 第 196 条）。客户增值税号：{vat}。' },
  ja: { title: '請求書', receiptTag: '領収書 — 支払済み', no: '番号', date: '日付', order: '注文', paid: '支払', billTo: '請求先', customer: 'お客様', description: '内容', amount: '金額', discount: '割引', subtotal: '小計（税抜）', vat: '付加価値税', reverseChargeShort: 'リバースチャージ', total: '合計', amountPaid: '支払金額', balanceDue: '未払残高', paidInFull: '支払済み', outsideEu: 'EU の付加価値税の対象外の販売です。', testBanner: 'テスト注文 — 有効な請求書ではありません', testNo: 'テスト — 有効な請求書ではありません', viesRef: 'VIES 照会番号', reverseChargeNote: 'リバースチャージ — 付加価値税は受領者が申告・納付します（理事会指令 2006/112/EC 第196条）。お客様の VAT 番号：{vat}。' },
  ko: { title: '인보이스', receiptTag: '영수증 — 결제 완료', no: '번호', date: '날짜', order: '주문', paid: '결제일', billTo: '청구 대상', customer: '고객', description: '내역', amount: '금액', discount: '할인', subtotal: '소계(공급가액)', vat: '부가가치세', reverseChargeShort: '대리납부', total: '합계', amountPaid: '결제 금액', balanceDue: '미결제 잔액', paidInFull: '결제 완료', outsideEu: 'EU 부가가치세 적용 대상이 아닌 판매입니다.', testBanner: '테스트 주문 — 유효한 인보이스가 아님', testNo: '테스트 — 유효한 인보이스가 아님', viesRef: 'VIES 조회 번호', reverseChargeNote: '대리납부 — 부가가치세는 공급받는 자가 신고·납부합니다(이사회 지침 2006/112/EC 제196조). 고객 VAT 번호: {vat}.' },
}

// Refund credit-note chrome (the rest reuses INVOICE_STRINGS). {no} = the
// original invoice number. ar falls back to en (uiLocale never returns 'ar').
const REFUND_STRINGS = {
  en: { creditTitle: 'CREDIT NOTE', refundTag: 'REFUND', refundOf: 'Refund of invoice {no}', refundLine: 'Refund', refundedFull: 'REFUNDED IN FULL', refundedPartial: 'PARTIAL REFUND', creditNo: 'Credit no.', refundDate: 'Refund date', totalRefunded: 'Total refunded' },
  da: { creditTitle: 'KREDITNOTA', refundTag: 'REFUSION', refundOf: 'Kreditering af faktura {no}', refundLine: 'Refusion', refundedFull: 'FULDT REFUNDERET', refundedPartial: 'DELVIS REFUSION', creditNo: 'Kreditnota nr.', refundDate: 'Refusionsdato', totalRefunded: 'Refunderet i alt' },
  de: { creditTitle: 'GUTSCHRIFT', refundTag: 'ERSTATTUNG', refundOf: 'Gutschrift zu Rechnung {no}', refundLine: 'Erstattung', refundedFull: 'VOLLSTÄNDIG ERSTATTET', refundedPartial: 'TEILERSTATTUNG', creditNo: 'Gutschrift-Nr.', refundDate: 'Erstattungsdatum', totalRefunded: 'Erstattet gesamt' },
  es: { creditTitle: 'NOTA DE CRÉDITO', refundTag: 'REEMBOLSO', refundOf: 'Reembolso de la factura {no}', refundLine: 'Reembolso', refundedFull: 'REEMBOLSADO ÍNTEGRAMENTE', refundedPartial: 'REEMBOLSO PARCIAL', creditNo: 'N.º de nota de crédito', refundDate: 'Fecha de reembolso', totalRefunded: 'Total reembolsado' },
  fr: { creditTitle: 'AVOIR', refundTag: 'REMBOURSEMENT', refundOf: 'Avoir sur facture {no}', refundLine: 'Remboursement', refundedFull: 'INTÉGRALEMENT REMBOURSÉ', refundedPartial: 'REMBOURSEMENT PARTIEL', creditNo: 'N° d’avoir', refundDate: 'Date de remboursement', totalRefunded: 'Total remboursé' },
  it: { creditTitle: 'NOTA DI CREDITO', refundTag: 'RIMBORSO', refundOf: 'Storno della fattura {no}', refundLine: 'Rimborso', refundedFull: 'RIMBORSATO PER INTERO', refundedPartial: 'RIMBORSO PARZIALE', creditNo: 'N. nota di credito', refundDate: 'Data di rimborso', totalRefunded: 'Totale rimborsato' },
  nl: { creditTitle: 'CREDITNOTA', refundTag: 'TERUGBETALING', refundOf: 'Creditering van factuur {no}', refundLine: 'Terugbetaling', refundedFull: 'VOLLEDIG TERUGBETAALD', refundedPartial: 'GEDEELTELIJKE TERUGBETALING', creditNo: 'Creditnota-nr.', refundDate: 'Datum terugbetaling', totalRefunded: 'Totaal terugbetaald' },
  nb: { creditTitle: 'KREDITNOTA', refundTag: 'REFUSJON', refundOf: 'Kreditering av faktura {no}', refundLine: 'Refusjon', refundedFull: 'FULLT REFUNDERT', refundedPartial: 'DELVIS REFUSJON', creditNo: 'Kreditnota-nr.', refundDate: 'Refusjonsdato', totalRefunded: 'Refundert totalt' },
  pl: { creditTitle: 'NOTA KREDYTOWA', refundTag: 'ZWROT', refundOf: 'Korekta do faktury {no}', refundLine: 'Zwrot', refundedFull: 'ZWRÓCONO W CAŁOŚCI', refundedPartial: 'ZWROT CZĘŚCIOWY', creditNo: 'Nr noty kredytowej', refundDate: 'Data zwrotu', totalRefunded: 'Łącznie zwrócono' },
  pt: { creditTitle: 'NOTA DE CRÉDITO', refundTag: 'REEMBOLSO', refundOf: 'Nota de crédito da fatura {no}', refundLine: 'Reembolso', refundedFull: 'REEMBOLSADO NA TOTALIDADE', refundedPartial: 'REEMBOLSO PARCIAL', creditNo: 'N.º de nota de crédito', refundDate: 'Data do reembolso', totalRefunded: 'Total reembolsado' },
  fi: { creditTitle: 'HYVITYSLASKU', refundTag: 'HYVITYS', refundOf: 'Hyvitys laskusta {no}', refundLine: 'Hyvitys', refundedFull: 'HYVITETTY TÄYSIMÄÄRÄISESTI', refundedPartial: 'OSITTAINEN HYVITYS', creditNo: 'Hyvityslaskun nro', refundDate: 'Hyvityspäivä', totalRefunded: 'Hyvitetty yhteensä' },
  sv: { creditTitle: 'KREDITFAKTURA', refundTag: 'ÅTERBETALNING', refundOf: 'Kreditering av faktura {no}', refundLine: 'Återbetalning', refundedFull: 'ÅTERBETALD I SIN HELHET', refundedPartial: 'DELVIS ÅTERBETALNING', creditNo: 'Kreditfaktura nr', refundDate: 'Återbetalningsdatum', totalRefunded: 'Totalt återbetalat' },
  ru: { creditTitle: 'КРЕДИТ-НОТА', refundTag: 'ВОЗВРАТ', refundOf: 'Возврат по счёту {no}', refundLine: 'Возврат', refundedFull: 'ВОЗВРАТ ПОЛНОСТЬЮ', refundedPartial: 'ЧАСТИЧНЫЙ ВОЗВРАТ', creditNo: 'Кредит-нота №', refundDate: 'Дата возврата', totalRefunded: 'Возвращено всего' },
  zh: { creditTitle: '贷项通知单', refundTag: '退款', refundOf: '针对发票 {no} 的退款', refundLine: '退款', refundedFull: '已全额退款', refundedPartial: '部分退款', creditNo: '贷项通知单编号', refundDate: '退款日期', totalRefunded: '退款合计' },
  ja: { creditTitle: 'クレジットノート', refundTag: '返金', refundOf: '請求書 {no} の返金', refundLine: '返金', refundedFull: '全額返金', refundedPartial: '一部返金', creditNo: 'クレジットノート番号', refundDate: '返金日', totalRefunded: '返金合計' },
  ko: { creditTitle: '대변전표', refundTag: '환불', refundOf: '인보이스 {no} 환불', refundLine: '환불', refundedFull: '전액 환불', refundedPartial: '부분 환불', creditNo: '대변전표 번호', refundDate: '환불일', totalRefunded: '환불 합계' },
}

/** Effective UI locale — `override` (e.g. 'da'/'en' for the accounting export)
 *  wins over the grant's issued locale; both fall back to English for scripts
 *  the font can't render or unknown locales. */
function uiLocale(grant, override) {
  const loc = override || (grant && grant.locale ? String(grant.locale) : 'en')
  return INVOICE_STRINGS[loc] && !NON_LATIN.has(loc) ? loc : 'en'
}

/** Shared two-line footer: business name · CVR · VAT · address (grey) + brand
 *  wordmark (red, letter-spaced), anchored above the bottom margin so it never
 *  spills onto another page. `testBanner`, when set, prints a red TEST notice. */
function drawSellerFooter(doc, { FN, left, right, testBanner, pageLabel }) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom
  const line2Y = bottomLimit - 14
  const line1Y = line2Y - 11
  doc.font(FN).fontSize(8).fillColor('#999999').text(
    `${SELLER.name} · CVR ${SELLER.cvr} · VAT ${SELLER.vat} · ${SELLER.addressLines.join(', ')}`,
    left, line1Y, { width: right - left, align: 'center', lineBreak: false },
  )
  const wordmark = SELLER.website.replace(/^https?:\/\//, '').replace(/\/$/, '').toUpperCase()
  doc.fillColor(STAMP_INK).fontSize(8.5).text(
    wordmark, left, line2Y, { width: right - left, align: 'center', lineBreak: false, characterSpacing: 3.5 },
  )
  if (testBanner) {
    doc.fillColor('#cc3344').fontSize(9).text(testBanner, left, line1Y - 14, { width: right - left, align: 'center', lineBreak: false, characterSpacing: 0 })
  }
  // Page label (multi-page only) — right-aligned on the wordmark baseline, which
  // is already safely in-bounds, so it never triggers an extra blank page.
  if (pageLabel) {
    doc.font(FN).fillColor('#999999').fontSize(8).text(
      pageLabel, left, line2Y, { width: right - left, align: 'right', lineBreak: false },
    )
  }
}

/** Minor units → "1.234,56 DKK" in the locale's grouping. */
function money(minor, currency, loc) {
  const n = (Number(minor || 0) / 100).toLocaleString(BCP47[loc] || loc || 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n} ${String(currency || 'DKK').toUpperCase()}`
}

function fmtDate(ms, loc) {
  return new Date(ms || Date.now()).toLocaleDateString(BCP47[loc] || loc || 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Localized word for a card payment. Other methods are brand names (Klarna,
// PayPal, iDEAL, …) and stay as-is. CJK/Cyrillic locales render natively.
const CARD_LABEL = {
  en: 'Card', da: 'Kort', de: 'Karte', es: 'Tarjeta', fr: 'Carte', it: 'Carta',
  nl: 'Kaart', nb: 'Kort', pl: 'Karta', pt: 'Cartão', fi: 'Kortti', sv: 'Kort',
  ru: 'Карта', zh: '银行卡', ja: 'カード', ko: '카드', ar: 'بطاقة',
}

/** Friendly, localized label for a Stripe payment_method type. */
function paymentLabel(method, loc) {
  if (!method) return null
  if (method === 'card') return CARD_LABEL[loc] || CARD_LABEL.en
  const map = {
    klarna: 'Klarna', paypal: 'PayPal', link: 'Link',
    sepa_debit: 'SEPA Direct Debit', ideal: 'iDEAL', bancontact: 'Bancontact',
    sofort: 'Sofort', giropay: 'giropay', mobilepay: 'MobilePay',
    revolut_pay: 'Revolut Pay', eps: 'EPS', p24: 'Przelewy24',
  }
  return map[method] || String(method).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Draw a "PAID" rubber-stamp from localized text — a tilted, double-ruled rounded
 * box with bold uppercase text in stamp-ink red. Right-anchored to `rightEdge`,
 * vertically centred on `cy`, and sized to the text so any locale fits. Replaces
 * the old plain green text mark. Returns the stamp box height (for layout).
 */
function drawPaidStamp(doc, text, rightEdge, cy, FB) {
  const fs = 13
  doc.font(FB).fontSize(fs)
  const tw = doc.widthOfString(text)
  const lh = doc.currentLineHeight()
  const padX = 18
  const padY = 10
  const boxW = Math.ceil(tw) + padX * 2
  const boxH = Math.ceil(lh) + padY * 2
  const cx = rightEdge - boxW / 2
  const x = cx - boxW / 2
  const y = cy - boxH / 2

  doc.save()
  doc.rotate(-7, { origin: [cx, cy] }) // slight tilt = hand-stamped feel
  doc.strokeColor(STAMP_INK)
  doc.lineWidth(2).roundedRect(x, y, boxW, boxH, 7).stroke()
  doc.lineWidth(0.8).roundedRect(x + 3.5, y + 3.5, boxW - 7, boxH - 7, 5).stroke()
  doc.fillColor(STAMP_INK).text(text, x, cy - lh / 2, { width: boxW, align: 'center' })
  doc.restore()
  return boxH
}

/** Register the embedded (or fallback) fonts on a fresh document, picking the
 *  CJK sub-font for Chinese/Japanese/Korean and Noto Sans otherwise. Falls back
 *  to Helvetica (Latin only) if no font file is present (e.g. local dev). */
function useFonts(doc, loc) {
  const FN = 'body'
  const FB = 'bold'
  const FI = 'italic'
  const cjk = CJK_PS[loc]
  try {
    if (cjk && existsSync(CJK_REGULAR)) {
      doc.registerFont(FN, CJK_REGULAR, `${cjk}-Regular`)
      doc.registerFont(FB, existsSync(CJK_BOLD) ? CJK_BOLD : CJK_REGULAR, `${cjk}-${existsSync(CJK_BOLD) ? 'Bold' : 'Regular'}`)
      doc.registerFont(FI, CJK_REGULAR, `${cjk}-Regular`) // CJK has no italic
      return { FN, FB, FI }
    }
    if (HAS_NOTO) {
      doc.registerFont(FN, NOTO_REGULAR)
      doc.registerFont(FB, NOTO_BOLD)
      doc.registerFont(FI, existsSync(NOTO_ITALIC) ? NOTO_ITALIC : NOTO_REGULAR)
      return { FN, FB, FI }
    }
  } catch (err) {
    console.warn('[invoice] font registration failed, using Helvetica:', err.message)
  }
  doc.registerFont(FN, 'Helvetica')
  doc.registerFont(FB, 'Helvetica-Bold')
  doc.registerFont(FI, 'Helvetica-Oblique')
  return { FN, FB, FI }
}

/**
 * Build the single-page RECEIPT for a grant. `priceBySku` maps sku → ex-VAT
 * (net) price in minor units. `langOverride` forces the language (e.g. the
 * accounting export in Danish/English) regardless of the issued locale.
 * Returns a Promise<Buffer>.
 */
export function buildInvoicePdf(grant, priceBySku, langOverride) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const loc = uiLocale(grant, langOverride)
      const { FN, FB, FI } = useFonts(doc, loc)
      const t = INVOICE_STRINGS[loc]

      const currency = grant.currency || 'DKK'
      const gross = Number(grant.amount || 0)
      const vat = Number(grant.taxAmount || 0)
      const net = Math.max(0, gross - vat)
      const ratePct = net > 0 && vat > 0 ? Math.round((vat / net) * 100) : 0
      const isTest = grant.livemode !== true
      const methodLabel = paymentLabel(grant.paymentMethod, loc)
      const paidOn = fmtDate(grant.paidAt || grant.invoiceDate || grant.createdAt, loc)

      // Prefer the full charged order (digital + physical) captured at checkout —
      // each line's net is post-discount, so the lines sum to the net subtotal by
      // construction (this is what makes a MIXED order add up). Fall back to the
      // legacy downloads-only path (priced via priceBySku) for older orders.
      const charged = Array.isArray(grant.lineItems) && grant.lineItems.length ? grant.lineItems : null
      const items = Array.isArray(grant.items) ? grant.items : []
      const haveAllPrices = !charged && items.every((i) => priceBySku && priceBySku.get(i.sku) != null)
      const lineNet = (i) => (priceBySku ? Number(priceBySku.get(i.sku) || 0) : 0)
      const catalogSum = haveAllPrices ? items.reduce((s, i) => s + lineNet(i), 0) : net
      const discount = haveAllPrices ? Math.max(0, catalogSum - net) : 0

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const ink = '#111111'
      const muted = '#666666'

      // ── Header: logo + seller (left) + INVOICE/RECEIPT block (right) ──
      // Header shows only name + address; CVR/VAT live in the footer note.
      // Draw the text first, then vertically centre the logo against that block
      // so the two are aligned (not the logo floating above the text).
      const logoH = 44
      const logoW = Math.round(logoH * LOGO_ASPECT)
      const sellerX = LOGO_PNG ? left + logoW + 16 : left
      const blockTop = 56
      doc.fillColor(ink).font(FB).fontSize(16).text(SELLER.name, sellerX, blockTop)
      doc.font(FN).fontSize(9).fillColor(muted)
      SELLER.addressLines.forEach((l) => doc.text(l))
      if (LOGO_PNG) {
        const logoY = (blockTop + doc.y) / 2 - logoH / 2
        doc.image(LOGO_PNG, left, logoY, { height: logoH })
      }

      doc.font(FB).fontSize(20).fillColor(ink).text(t.title, left, 56, { align: 'right' })
      doc.font(FB).fontSize(8).fillColor(STAMP_INK).text(t.receiptTag, { align: 'right' })
      doc.font(FN).fontSize(9).fillColor(muted)
      doc.text(`${t.no}  ${grant.invoiceNumber || (isTest ? t.testNo : '—')}`, { align: 'right' })
      doc.text(`${t.date}  ${fmtDate(grant.invoiceDate || grant.createdAt, loc)}`, { align: 'right' })
      doc.text(`${t.order}  ${grant.orderId}`, { align: 'right' })
      doc.text(`${t.paid}  ${paidOn}${methodLabel ? `  ·  ${methodLabel}` : ''}`, { align: 'right' })

      // ── Bill to ──
      let y = 160
      doc.font(FB).fontSize(9).fillColor(muted).text(t.billTo, left, y)
      doc.font(FN).fontSize(10).fillColor(ink)
      if (grant.businessName || grant.vatId) {
        if (grant.businessName) doc.text(grant.businessName)
        if (grant.businessAddress) {
          doc.fillColor(muted).fontSize(9)
          String(grant.businessAddress).split(/\s*,\s*|\n/).filter(Boolean).forEach((l) => doc.text(l))
        }
        if (grant.vatId) doc.fillColor(muted).fontSize(9).text(`${t.vat} ${grant.vatId}`)
      } else if (grant.shipping && grant.shipping.name) {
        // Consumer order with a checkout name + address: bill to the person at
        // their address; the email drops to a secondary line.
        doc.text(grant.shipping.name)
        const a = grant.shipping.address || {}
        const addrLines = [
          a.line1,
          a.line2,
          [a.postalCode, a.city].filter(Boolean).join(' '),
          a.state,
          a.country,
        ].filter(Boolean)
        if (addrLines.length) {
          doc.fillColor(muted).fontSize(9)
          addrLines.forEach((l) => doc.text(l))
        }
        if (grant.email) doc.fillColor(muted).fontSize(9).text(grant.email)
      } else {
        doc.text(grant.email || t.customer)
      }

      // ── Line items table — flows below Bill To and paginates ──
      const amountX = left + 250
      const descW = 360
      // Stop rows above the footer (seller line + wordmark live in the last ~30pt).
      const contentBottom = () => doc.page.height - doc.page.margins.bottom - 34
      const drawItemsHeader = (yy) => {
        doc.font(FB).fontSize(9).fillColor(muted)
        doc.text(t.description, left, yy)
        doc.text(t.amount, left, yy, { align: 'right' })
        doc.moveTo(left, yy + 14).lineTo(right, yy + 14).strokeColor('#dddddd').stroke()
        return yy + 22
      }
      // Start the table below the taller of Bill To / the right-hand meta block.
      y = drawItemsHeader(Math.max(doc.y, 150) + 26)

      // Draw one line: bold-free main label + amount, then an optional muted
      // sub-line (paper · size, or format · px) with the filename in italics.
      const drawLine = (label, amount, detail, filename) => {
        doc.font(FN).fontSize(10)
        const mainH = doc.heightOfString(label, { width: descW })
        const subH = detail || filename ? 13 : 0
        if (y + mainH + subH > contentBottom()) {
          doc.addPage()
          y = drawItemsHeader(doc.page.margins.top + 8)
        }
        const rowTop = y
        doc.font(FN).fontSize(10).fillColor(ink)
        doc.text(label, left, rowTop, { width: descW })
        const labelBottom = doc.y
        if (amount) doc.text(amount, left, rowTop, { align: 'right' })
        y = Math.max(labelBottom, doc.y)
        if (detail || filename) {
          y += 1
          doc.fontSize(8.5)
          if (detail) doc.font(FN).fillColor(muted).text(detail, left + 10, y, { width: descW, continued: !!filename })
          if (filename) {
            doc.font(FI).fillColor('#888888')
              .text(`${detail ? '   ' : ''}(${filename})`, detail ? undefined : left + 10, detail ? undefined : y, { width: descW })
          }
          y = doc.y
        }
        y += 9
      }

      if (charged) {
        for (const i of charged) {
          const qty = Number(i.qty) || 1
          const label = (qty > 1 ? `${qty} × ` : '') + (i.label || i.sku)
          drawLine(label, money(Number(i.net) || 0, currency, loc), i.detail || null, i.filename || null)
        }
      } else {
        for (const i of items) {
          drawLine(i.label || i.sku, haveAllPrices ? money(lineNet(i), currency, loc) : '', null, null)
        }
      }

      // ── Totals — kept together; pushed to a new page if they wouldn't fit ──
      const totalsH = 18 + (discount > 0 ? 16 : 0) + 16 + 16 + 20 + 16 + 16 + 70
      if (y + totalsH > contentBottom()) {
        doc.addPage()
        y = doc.page.margins.top + 8
      }
      y += 6
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#dddddd').stroke()
      y += 12
      const totalRow = (label, value, bold) => {
        doc.font(bold ? FB : FN).fontSize(bold ? 11 : 10).fillColor(ink)
        // Label gets the whole left half and never wraps — long localized labels
        // would otherwise spill onto a second line and collide with the next row.
        doc.text(label, left, y, { width: 360, align: 'right', lineBreak: false })
        doc.text(value, amountX, y, { width: right - amountX, align: 'right' })
        y += bold ? 20 : 16
      }
      if (discount > 0) totalRow(t.discount, `−${money(discount, currency, loc)}`)
      totalRow(t.subtotal, money(net, currency, loc))
      totalRow(grant.reverseCharge ? `${t.vat} (${t.reverseChargeShort})` : `${t.vat} (${ratePct}%)`, money(vat, currency, loc))
      totalRow(t.total, money(gross, currency, loc), true)
      // Receipt: paid in full, so nothing is outstanding.
      totalRow(t.amountPaid, money(gross, currency, loc))
      totalRow(t.balanceDue, money(0, currency, loc))

      // ── PAID IN FULL stamp (localized rubber stamp) ──
      y += 12
      const stampCy = y + 18
      drawPaidStamp(doc, t.paidInFull, right - 8, stampCy, FB)
      const capY = stampCy + 28
      doc.font(FN).fontSize(8).fillColor(muted)
        .text(`${t.paid} ${paidOn}${methodLabel ? ` · ${methodLabel}` : ''}`, amountX, capY, { width: right - amountX, align: 'right' })
      y = capY + 16

      // ── VAT notes ──
      doc.font(FN).fontSize(8.5).fillColor(muted)
      if (grant.reverseCharge) {
        doc.text(
          t.reverseChargeNote.replace('{vat}', grant.vatId || '—') +
          (grant.vatConsultation ? ` ${t.viesRef}: ${grant.vatConsultation}.` : ''),
          left, y, { width: right - left },
        )
      } else if (vat === 0) {
        doc.text(t.outsideEu, left, y, { width: right - left })
      }

      // ── Footer on EVERY page (+ page numbers when the order runs to two) ──
      const range = doc.bufferedPageRange()
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i)
        drawSellerFooter(doc, {
          FN, left, right,
          testBanner: isTest ? t.testBanner : null,
          pageLabel: range.count > 1 ? `${i + 1} / ${range.count}` : null,
        })
      }
      doc.flushPages()
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Build the REFUND credit note for a (partly or fully) refunded order — a single
 * page that mirrors the invoice but shows the refunded amounts as a credit
 * (negative), referencing the original invoice. `priceBySku` maps sku → ex-VAT
 * net price; `langOverride` forces the language. Returns Promise<Buffer>, or
 * Promise<null> when the order has no recorded refund.
 */
export function buildRefundPdf(grant, priceBySku, langOverride) {
  const refundGross = Number(grant.refundedAmount || 0)
  if (!(refundGross > 0)) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const loc = uiLocale(grant, langOverride)
      const { FN, FB, FI } = useFonts(doc, loc)
      const t = INVOICE_STRINGS[loc]
      const rt = REFUND_STRINGS[loc] || REFUND_STRINGS.en

      const currency = grant.currency || 'DKK'
      const origGross = Number(grant.amount || 0)
      const origVat = Number(grant.taxAmount || 0)
      const refundVat = origGross > 0 ? Math.round(refundGross * origVat / origGross) : 0
      const refundNet = Math.max(0, refundGross - refundVat)
      const isFull = grant.refunded === true
      const isTest = grant.livemode !== true
      const refundOn = fmtDate(grant.creditDate || grant.refundedAt || Date.now(), loc)

      // Prefer the full charged order (digital + physical) for richer, reconciling
      // credit lines — same source as the invoice (paper/size, format/px/file).
      // Fall back to the legacy downloads-only path priced via priceBySku.
      const charged = Array.isArray(grant.lineItems) && grant.lineItems.length ? grant.lineItems : null
      const items = Array.isArray(grant.items) ? grant.items : []
      const havePrices = !charged && items.every((i) => priceBySku && priceBySku.get(i.sku) != null)
      const lineNet = (i) => (priceBySku ? Number(priceBySku.get(i.sku) || 0) : 0)
      // Which lines to credit: a whole-line-item refund lists its skus; a full
      // refund lists everything; an arbitrary partial shows a single Refund line.
      const skus = Array.isArray(grant.revokedSkus) ? grant.revokedSkus : []
      const creditLines = charged
        ? (skus.length ? charged.filter((i) => skus.includes(i.sku)) : isFull ? charged : null)
        : null
      const legacyLines = !charged
        ? (skus.length ? items.filter((i) => skus.includes(i.sku)) : isFull ? items : null)
        : null

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const ink = '#111111'
      const muted = '#666666'

      // ── Header: logo + seller (left) + CREDIT NOTE block (right) ──
      const logoH = 44
      const logoW = Math.round(logoH * LOGO_ASPECT)
      const sellerX = LOGO_PNG ? left + logoW + 16 : left
      const blockTop = 56
      doc.fillColor(ink).font(FB).fontSize(16).text(SELLER.name, sellerX, blockTop)
      doc.font(FN).fontSize(9).fillColor(muted)
      SELLER.addressLines.forEach((l) => doc.text(l))
      if (LOGO_PNG) {
        const logoY = (blockTop + doc.y) / 2 - logoH / 2
        doc.image(LOGO_PNG, left, logoY, { height: logoH })
      }

      doc.font(FB).fontSize(20).fillColor(ink).text(rt.creditTitle, left, 56, { align: 'right' })
      doc.font(FB).fontSize(8).fillColor(STAMP_INK).text(rt.refundTag, { align: 'right' })
      doc.font(FN).fontSize(9).fillColor(muted)
      doc.text(`${rt.creditNo}  ${grant.creditNumber || (isTest ? t.testNo : '—')}`, { align: 'right' })
      doc.text(`${rt.refundDate}  ${refundOn}`, { align: 'right' })
      doc.text(`${t.order}  ${grant.orderId}`, { align: 'right' })
      doc.text(rt.refundOf.replace('{no}', grant.invoiceNumber || '—'), { align: 'right' })

      // ── Bill to ──
      let y = 160
      doc.font(FB).fontSize(9).fillColor(muted).text(t.billTo, left, y)
      doc.font(FN).fontSize(10).fillColor(ink)
      if (grant.businessName || grant.vatId) {
        if (grant.businessName) doc.text(grant.businessName)
        if (grant.businessAddress) {
          doc.fillColor(muted).fontSize(9)
          String(grant.businessAddress).split(/\s*,\s*|\n/).filter(Boolean).forEach((l) => doc.text(l))
        }
        if (grant.vatId) doc.fillColor(muted).fontSize(9).text(`${t.vat} ${grant.vatId}`)
      } else if (grant.shipping && grant.shipping.name) {
        // Consumer order with a checkout name + address: bill to the person at
        // their address; the email drops to a secondary line.
        doc.text(grant.shipping.name)
        const a = grant.shipping.address || {}
        const addrLines = [
          a.line1,
          a.line2,
          [a.postalCode, a.city].filter(Boolean).join(' '),
          a.state,
          a.country,
        ].filter(Boolean)
        if (addrLines.length) {
          doc.fillColor(muted).fontSize(9)
          addrLines.forEach((l) => doc.text(l))
        }
        if (grant.email) doc.fillColor(muted).fontSize(9).text(grant.email)
      } else {
        doc.text(grant.email || t.customer)
      }

      // ── Line items (credit — negative) — flows below Bill To and paginates ──
      const amountX = left + 250
      const descW = 360
      // Stop rows above the footer (seller line + wordmark live in the last ~30pt).
      const contentBottom = () => doc.page.height - doc.page.margins.bottom - 34
      const drawItemsHeader = (yy) => {
        doc.font(FB).fontSize(9).fillColor(muted)
        doc.text(t.description, left, yy)
        doc.text(t.amount, left, yy, { align: 'right' })
        doc.moveTo(left, yy + 14).lineTo(right, yy + 14).strokeColor('#dddddd').stroke()
        return yy + 22
      }
      y = drawItemsHeader(Math.max(doc.y, 150) + 26)

      // One credit line: main label + negative amount, then an optional muted
      // sub-line (paper · size, or format · px) with the filename in italics.
      const drawLine = (label, amount, detail, filename) => {
        doc.font(FN).fontSize(10)
        const mainH = doc.heightOfString(label, { width: descW })
        const subH = detail || filename ? 13 : 0
        if (y + mainH + subH > contentBottom()) {
          doc.addPage()
          y = drawItemsHeader(doc.page.margins.top + 8)
        }
        const rowTop = y
        doc.font(FN).fontSize(10).fillColor(ink)
        doc.text(label, left, rowTop, { width: descW })
        const labelBottom = doc.y
        if (amount) doc.text(amount, left, rowTop, { align: 'right' })
        y = Math.max(labelBottom, doc.y)
        if (detail || filename) {
          y += 1
          doc.fontSize(8.5)
          if (detail) doc.font(FN).fillColor(muted).text(detail, left + 10, y, { width: descW, continued: !!filename })
          if (filename) {
            doc.font(FI).fillColor('#888888')
              .text(`${detail ? '   ' : ''}(${filename})`, detail ? undefined : left + 10, detail ? undefined : y, { width: descW })
          }
          y = doc.y
        }
        y += 9
      }

      if (creditLines) {
        for (const i of creditLines) {
          const qty = Number(i.qty) || 1
          const label = (qty > 1 ? `${qty} × ` : '') + (i.label || i.sku)
          drawLine(label, `−${money(Number(i.net) || 0, currency, loc)}`, i.detail || null, i.filename || null)
        }
      } else if (legacyLines && havePrices) {
        for (const i of legacyLines) {
          drawLine(i.label || i.sku, `−${money(lineNet(i), currency, loc)}`, null, null)
        }
      } else {
        drawLine(rt.refundLine, `−${money(refundNet, currency, loc)}`, null, null)
      }

      // ── Totals (all negative) — kept together; pushed to a new page if needed ──
      const totalsH = 16 + 16 + 20 + 70
      if (y + totalsH > contentBottom()) {
        doc.addPage()
        y = doc.page.margins.top + 8
      }
      y += 6
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#dddddd').stroke()
      y += 12
      const totalRow = (label, value, bold) => {
        doc.font(bold ? FB : FN).fontSize(bold ? 11 : 10).fillColor(ink)
        doc.text(label, left, y, { width: 360, align: 'right', lineBreak: false })
        doc.text(value, amountX, y, { width: right - amountX, align: 'right' })
        y += bold ? 20 : 16
      }
      totalRow(t.subtotal, `−${money(refundNet, currency, loc)}`)
      totalRow(grant.reverseCharge ? `${t.vat} (${t.reverseChargeShort})` : t.vat, `−${money(refundVat, currency, loc)}`)
      totalRow(rt.totalRefunded, `−${money(refundGross, currency, loc)}`, true)

      // ── Refund stamp ──
      y += 12
      const stampCy = y + 18
      drawPaidStamp(doc, isFull ? rt.refundedFull : rt.refundedPartial, right - 8, stampCy, FB)
      const capY = stampCy + 28
      doc.font(FN).fontSize(8).fillColor(muted)
        .text(`${rt.refundDate}: ${refundOn}`, amountX, capY, { width: right - amountX, align: 'right' })

      // ── Footer on EVERY page (+ page numbers when the note runs to two) ──
      const range = doc.bufferedPageRange()
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i)
        drawSellerFooter(doc, {
          FN, left, right,
          testBanner: isTest ? t.testBanner : null,
          pageLabel: range.count > 1 ? `${i + 1} / ${range.count}` : null,
        })
      }
      doc.flushPages()
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Build the standalone licensing Terms & Conditions PDF from the snapshot stored
 * on the grant (grant.terms, in the buyer's language). Returns Promise<Buffer>,
 * or Promise<null> when there are no terms to render (e.g. legacy orders).
 */
export function buildLicensePdf(grant, langOverride) {
  const terms = grant && grant.terms && typeof grant.terms === 'object' ? grant.terms : null
  if (!terms || !terms.title) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const loc = uiLocale(grant, langOverride)
      const { FN, FB } = useFonts(doc, loc)
      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const ink = '#111111'
      const muted = '#666666'

      // ── Header: logo + seller + order reference (logo centred on the text) ──
      const logoH = 40
      const logoW = Math.round(logoH * LOGO_ASPECT)
      const sellerX = LOGO_PNG ? left + logoW + 16 : left
      const blockTop = 54
      doc.fillColor(ink).font(FB).fontSize(13).text(SELLER.name, sellerX, blockTop)
      doc.font(FN).fontSize(8.5).fillColor(muted)
        .text(`${INVOICE_STRINGS[loc].order} ${grant.orderId} · ${fmtDate(grant.invoiceDate || grant.createdAt, loc)}`, sellerX)
      if (LOGO_PNG) {
        const logoY = (blockTop + doc.y) / 2 - logoH / 2
        doc.image(LOGO_PNG, left, logoY, { height: logoH })
      }

      doc.moveTo(left, 104).lineTo(right, 104).strokeColor('#dddddd').stroke()
      doc.y = 118
      doc.x = left

      renderTerms(doc, terms, { FN, FB, ink, muted, left, right })

      // Same footer as the invoice (on the last page).
      const isTest = grant.livemode !== true
      drawSellerFooter(doc, { FN, left, right, testBanner: isTest ? INVOICE_STRINGS[loc].testBanner : null })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Render the licensing terms from a snapshot, starting at the current cursor.
 * PDFKit auto-paginates if the text runs past the page.
 */
function renderTerms(doc, t, { FN, FB, ink, muted, left, right }) {
  const W = right - left

  const heading = (s) => { if (!s) return; doc.moveDown(0.5); doc.font(FB).fontSize(10.5).fillColor(ink).text(s, left, doc.y, { width: W }); doc.moveDown(0.2) }
  const label = (s) => { if (!s) return; doc.moveDown(0.15); doc.font(FB).fontSize(8.5).fillColor(ink).text(s, left, doc.y, { width: W }) }
  const para = (s) => { if (!s) return; doc.font(FN).fontSize(8.5).fillColor(muted).text(s, left, doc.y, { width: W }); doc.moveDown(0.12) }
  const bullet = (s) => { if (!s) return; doc.font(FN).fontSize(8.5).fillColor(muted).text(`•  ${s}`, left + 10, doc.y, { width: W - 10 }); doc.moveDown(0.08) }

  // Title block
  doc.font(FB).fontSize(15).fillColor(ink).text(t.title, left, doc.y, { width: W })
  if (t.byline) doc.font(FN).fontSize(10).fillColor(muted).text(t.byline, left, doc.y, { width: W })
  doc.moveDown(0.5)
  para(t.intro)

  // 1 — License tiers (labelled sub-blocks with bullets)
  heading(t.s1Title)
  label(t.s1PersonalLabel); bullet(t.s1Personal1); bullet(t.s1Personal2); bullet(t.s1Personal3)
  label(t.s1EditorialLabel); bullet(t.s1Editorial1); bullet(t.s1Editorial2); bullet(t.s1Editorial3); bullet(t.s1Editorial4)
  label(t.s1CommercialLabel); bullet(t.s1Commercial1); bullet(t.s1Commercial2); bullet(t.s1Commercial3)
  label(t.s1FullLabel); bullet(t.s1Full1); bullet(t.s1Full2); bullet(t.s1Full3)
  if (t.s1RawNote) { doc.moveDown(0.15); para(t.s1RawNote) }

  // 2 — General restrictions
  heading(t.s2Title); para(t.s2Intro)
  bullet(t.s2_1); bullet(t.s2_2); bullet(t.s2_3); bullet(t.s2_4); bullet(t.s2_5)

  // 3 — Public event & personality rights
  heading(t.s3Title); para(t.s3_1); para(t.s3_2)

  // 4 — File delivery & technical specs
  heading(t.s4Title); bullet(t.s4_1); bullet(t.s4_2); bullet(t.s4_3)

  // 5 — No warranty & limitation of liability
  heading(t.s5Title); para(t.s5_1)

  // 6 — Governing law
  heading(t.s6Title); para(t.s6_1)

  // 7 — Contact & custom licenses
  heading(t.s7Title); para(t.s7_1)
  if (t.s7Thanks) { doc.moveDown(0.4); doc.font(FN).fontSize(8.5).fillColor(muted).text(t.s7Thanks, left, doc.y, { width: W }) }
}
