/**
 * VAT-compliant invoice PDF generation (origin-side).
 *
 * Built from a stored grant + the catalog net prices. Handles the three VAT
 * cases: standard-rated (B2C / DK business), intra-EU B2B reverse charge (0% +
 * the Art. 196 note and the VIES consultation number), and outside-EU (0%).
 *
 * SELLER identity is fixed (mirrors src/lib/seller.ts on the Worker side).
 */

import PDFDocument from 'pdfkit'

export const SELLER = {
  name: 'Gus McEwan Photography',
  vat: 'DK34922993',
  cvr: '34922993',
  addressLines: ['Ryesgade 62, 4. 35', '2100 København Ø', 'Denmark'],
  email: process.env.MAIL_FROM || 'email@gusmcewan.com',
}

/** Minor units → "1.234,56 DKK" (Danish grouping). */
function money(minor, currency) {
  const n = (Number(minor || 0) / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n} ${String(currency || 'DKK').toUpperCase()}`
}

function fmtDate(ms) {
  return new Date(ms || Date.now()).toLocaleDateString('da-DK', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Build the invoice PDF for a grant. `priceBySku` maps sku → ex-VAT (net) price
 * in minor units (from catalogPriceMap). Returns a Promise<Buffer>.
 */
export function buildInvoicePdf(grant, priceBySku) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const currency = grant.currency || 'DKK'
      const gross = Number(grant.amount || 0)
      const vat = Number(grant.taxAmount || 0)
      const net = Math.max(0, gross - vat)
      const ratePct = net > 0 && vat > 0 ? Math.round((vat / net) * 100) : 0
      const isTest = grant.livemode !== true

      const items = Array.isArray(grant.items) ? grant.items : []
      const haveAllPrices = items.every((i) => priceBySku && priceBySku.get(i.sku) != null)
      const lineNet = (i) => (priceBySku ? Number(priceBySku.get(i.sku) || 0) : 0)
      const catalogSum = haveAllPrices ? items.reduce((s, i) => s + lineNet(i), 0) : net
      const discount = haveAllPrices ? Math.max(0, catalogSum - net) : 0

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const ink = '#111111'
      const muted = '#666666'

      // ── Header: seller (left) + INVOICE block (right) ──
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(SELLER.name, left, 56)
      doc.font('Helvetica').fontSize(9).fillColor(muted)
      SELLER.addressLines.forEach((l) => doc.text(l))
      doc.text(`CVR ${SELLER.cvr}  ·  VAT ${SELLER.vat}`)
      doc.text(SELLER.email)

      doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text('INVOICE', left, 56, { align: 'right' })
      doc.font('Helvetica').fontSize(9).fillColor(muted)
      doc.text(`No.  ${grant.invoiceNumber || (isTest ? 'TEST — not a valid invoice' : '—')}`, { align: 'right' })
      doc.text(`Date  ${fmtDate(grant.invoiceDate || grant.createdAt)}`, { align: 'right' })
      doc.text(`Order  ${grant.orderId}`, { align: 'right' })

      // ── Bill to ──
      let y = 150
      doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('BILL TO', left, y)
      doc.font('Helvetica').fontSize(10).fillColor(ink)
      if (grant.businessName || grant.vatId) {
        if (grant.businessName) doc.text(grant.businessName)
        if (grant.businessAddress) {
          doc.fillColor(muted).fontSize(9)
          String(grant.businessAddress).split(/\s*,\s*|\n/).filter(Boolean).forEach((l) => doc.text(l))
        }
        if (grant.vatId) doc.fillColor(muted).fontSize(9).text(`VAT ${grant.vatId}`)
      } else {
        doc.text(grant.email || 'Customer')
      }

      // ── Line items table ──
      y = 210
      doc.font('Helvetica-Bold').fontSize(9).fillColor(muted)
      doc.text('DESCRIPTION', left, y)
      doc.text('AMOUNT', left, y, { align: 'right' })
      y += 6
      doc.moveTo(left, y + 8).lineTo(right, y + 8).strokeColor('#dddddd').stroke()
      y += 16

      doc.font('Helvetica').fontSize(10).fillColor(ink)
      for (const i of items) {
        doc.text(i.label || i.sku, left, y, { width: 340 })
        if (haveAllPrices) doc.text(money(lineNet(i), currency), left, y, { align: 'right' })
        y = doc.y + 6
      }

      // ── Totals ──
      y += 6
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#dddddd').stroke()
      y += 12
      const totalRow = (label, value, bold) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(ink)
        doc.text(label, left + 250, y, { width: 130, align: 'right' })
        doc.text(value, left + 250, y, { width: right - (left + 250), align: 'right' })
        y += bold ? 20 : 16
      }
      if (discount > 0) totalRow('Discount', `−${money(discount, currency)}`)
      totalRow('Subtotal (net)', money(net, currency))
      totalRow(grant.reverseCharge ? 'VAT (reverse charge)' : `VAT (${ratePct}%)`, money(vat, currency))
      totalRow('Total', money(gross, currency), true)

      // ── VAT notes ──
      y += 10
      doc.font('Helvetica').fontSize(8.5).fillColor(muted)
      if (grant.reverseCharge) {
        doc.text(
          `Reverse charge — VAT to be accounted for by the recipient (Article 196 of Council Directive 2006/112/EC). ` +
          `Customer VAT: ${grant.vatId || '—'}.` +
          (grant.vatConsultation ? ` VIES consultation no.: ${grant.vatConsultation}.` : ''),
          left, y, { width: right - left },
        )
      } else if (vat === 0) {
        doc.text('Sale outside the scope of EU VAT.', left, y, { width: right - left })
      }

      // ── Footer ──
      doc.font('Helvetica').fontSize(8).fillColor('#999999')
      doc.text(
        `${SELLER.name} · CVR ${SELLER.cvr} · VAT ${SELLER.vat} · ${SELLER.addressLines.join(', ')}`,
        left, doc.page.height - 70, { width: right - left, align: 'center' },
      )
      if (isTest) {
        doc.fillColor('#cc3344').fontSize(9).text('TEST ORDER — NOT A VALID INVOICE', left, doc.page.height - 56, { align: 'center' })
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
