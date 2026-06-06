/**
 * quotePdf.tsx  — SERVER ONLY
 * React PDF document for generating a professional quote PDF.
 * Only imported by /api/generate-quote-pdf (server route).
 */

import 'server-only'
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Quote, Settings } from './types'
import { calcPhaseSell, VAT } from './utils'

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#2b2f33',
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },

  // Header bar
  header: {
    backgroundColor: '#2b3a2b',
    paddingHorizontal: 36,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: { flex: 1 },
  coName: { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  coTagline: { color: '#c8d8a8', fontSize: 8, letterSpacing: 1 },
  headerRight: { alignItems: 'flex-end' },
  quoteLabel: { color: '#c8d8a8', fontSize: 8, letterSpacing: 1, marginBottom: 3 },
  quoteRef: { color: '#ffffff', fontSize: 16, fontFamily: 'Helvetica-Bold' },

  // Body
  body: { paddingHorizontal: 36, paddingTop: 24 },

  // Info grid
  infoRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
    backgroundColor: '#f8f5f0',
    borderRadius: 4,
    padding: 14,
  },
  infoBlock: { flex: 1 },
  infoLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: '#8a8278',
    marginBottom: 2,
    marginTop: 6,
  },
  infoLabelFirst: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: '#8a8278',
    marginBottom: 2,
  },
  infoValue: { fontSize: 9, color: '#1a1612' },

  // Scope block
  scopeBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#7ab533',
    paddingLeft: 10,
    paddingVertical: 8,
    marginBottom: 18,
    backgroundColor: '#f8faf2',
    borderRadius: 2,
  },
  scopeLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: '#5a8a20',
    marginBottom: 4,
  },
  scopeText: { fontSize: 9, color: '#1e2022', lineHeight: 1.5 },

  // Section heading
  sectionHeading: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: '#2b2f33',
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: '#3d4a3e',
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2b2f33',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 2,
  },
  tableHeaderText: { color: '#ffffff', fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e0d0',
  },
  tableRowAlt: { backgroundColor: '#f8f5f0' },
  phaseRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: '#e8ecf0',
  },
  phaseText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#2b2f33', flex: 1 },
  phaseTotalLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#2b2f33', textAlign: 'right', marginRight: 2 },
  phaseTotalVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#2b2f33', width: 80, textAlign: 'right' },

  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'center' },
  colUnit: { width: 36, textAlign: 'center' },
  colAmt: { width: 80, textAlign: 'right' },
  colVat: { width: 72, textAlign: 'right' },
  cellText: { fontSize: 8, color: '#1e2022' },
  cellNote: { fontSize: 7, color: '#8a8278', marginTop: 2 },

  // Totals block
  totalsBox: {
    alignSelf: 'flex-end',
    width: 240,
    marginTop: 16,
    marginBottom: 20,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e0d0',
  },
  totalsRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2b3a2b',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 2,
    marginTop: 2,
  },
  totalsLabel: { fontSize: 9, color: '#444' },
  totalsValue: { fontSize: 9, color: '#1e2022', fontFamily: 'Helvetica-Bold' },
  totalsFinalLabel: { fontSize: 10, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  totalsFinalValue: { fontSize: 10, color: '#ffffff', fontFamily: 'Helvetica-Bold' },

  // Terms
  termsBox: {
    backgroundColor: '#f8f5f0',
    borderRadius: 4,
    padding: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  termsHeading: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: '#8a8278',
    marginBottom: 5,
  },
  termsText: { fontSize: 8, color: '#444', lineHeight: 1.6 },

  // Contact line
  contactLine: { fontSize: 8.5, color: '#444', lineHeight: 1.6, marginTop: 8 },

  // Footer bar
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2b2f33',
    paddingHorizontal: 36,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: 'rgba(255,255,255,0.5)' },

  vatNote: { fontSize: 7.5, color: '#8a8278', textAlign: 'right', marginTop: 3 },
})

// ── Document component ────────────────────────────────────────────────────────

interface Props {
  quote: Quote
  settings: Settings
}

export function QuotePdfDocument({ quote, settings }: Props) {
  const co = settings
  const qMkp = quote.markup || 0
  const qVat = quote.vatIncluded
  const now = new Date()

  const net = quote.phases.reduce((s, p) => s + calcPhaseSell(p, qMkp), 0)
  const vat = qVat ? net * VAT : 0
  const total = net + vat

  const validUntil = new Date(now.getTime() + 30 * 864e5)

  // Build contact line as a plain string — avoids mixing React elements with strings inside <Text>
  const contactParts = [co.contact || co.name || '']
  if (co.phone) contactParts.push(co.phone)
  if (co.email) contactParts.push(co.email)
  const contactStr = `To accept this quotation or to discuss the works, please contact us:\n${contactParts.join('  ·  ')}`

  return (
    <Document
      title={`Quote ${quote.ref || ''} — ${quote.customer.name || ''}`}
      author={co.name || 'Small Build Company'}
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.coName}>{co.name || 'Small Build Company Ltd'}</Text>
            <Text style={S.coTagline}>{co.tagline || 'Building Extensions & Renovations'}</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.quoteLabel}>Quotation</Text>
            <Text style={S.quoteRef}>{quote.ref || 'DRAFT'}</Text>
          </View>
        </View>

        <View style={S.body}>

          {/* ── Info grid — NO fragments, each conditional is its own expression ── */}
          <View style={S.infoRow}>

            <View style={S.infoBlock}>
              <Text style={S.infoLabelFirst}>Quote Reference</Text>
              <Text style={S.infoValue}>{quote.ref || '—'}</Text>
              <Text style={S.infoLabel}>Date Issued</Text>
              <Text style={S.infoValue}>{dateStr(now)}</Text>
              <Text style={S.infoLabel}>Valid Until</Text>
              <Text style={S.infoValue}>{dateStr(validUntil)}</Text>
            </View>

            <View style={S.infoBlock}>
              <Text style={S.infoLabelFirst}>Prepared For</Text>
              <Text style={S.infoValue}>{quote.customer.name || '—'}</Text>
              <Text style={S.infoLabel}>Property</Text>
              <Text style={S.infoValue}>{quote.customer.address || '—'}</Text>
              <Text style={S.infoLabel}>Job Type</Text>
              <Text style={S.infoValue}>{quote.jobType}</Text>
            </View>

            <View style={S.infoBlock}>
              <Text style={S.infoLabelFirst}>Company</Text>
              <Text style={S.infoValue}>{co.name || '—'}</Text>
              {/* No fragments — separate conditionals for label and value */}
              {co.phone ? <Text style={S.infoLabel}>Phone</Text> : null}
              {co.phone ? <Text style={S.infoValue}>{co.phone}</Text> : null}
              {co.email ? <Text style={S.infoLabel}>Email</Text> : null}
              {co.email ? <Text style={S.infoValue}>{co.email}</Text> : null}
            </View>

          </View>

          {/* ── Scope ── */}
          {quote.scope ? (
            <View style={S.scopeBox}>
              <Text style={S.scopeLabel}>Scope of Works</Text>
              <Text style={S.scopeText}>{quote.scope}</Text>
            </View>
          ) : null}

          {/* ── Items table ── */}
          <Text style={S.sectionHeading}>{`Itemised Estimate — ${quote.jobType}`}</Text>

          {/* Table header */}
          <View style={S.tableHeader}>
            <Text style={[S.tableHeaderText, S.colDesc]}>Description</Text>
            <Text style={[S.tableHeaderText, S.colQty]}>Qty</Text>
            <Text style={[S.tableHeaderText, S.colUnit]}>Unit</Text>
            <Text style={[S.tableHeaderText, S.colAmt]}>Sell (ex-VAT)</Text>
            {qVat ? <Text style={[S.tableHeaderText, S.colVat]}>VAT (20%)</Text> : null}
          </View>

          {/* Phase rows */}
          {quote.phases.map((p, pi) => {
            const phaseSell = calcPhaseSell(p, qMkp)
            const phaseVat = qVat ? phaseSell * VAT : 0
            const phaseLabel = p.parentPhase ? `${p.parentPhase} — ${p.phase}` : p.phase
            return (
              <View key={pi}>
                {/* Phase header row */}
                <View style={S.phaseRow}>
                  <Text style={S.phaseText}>{phaseLabel}</Text>
                  <Text style={S.phaseTotalLabel}>Phase total</Text>
                  <Text style={S.phaseTotalVal}>{fmtGBP(phaseSell)}</Text>
                  {qVat ? <Text style={[S.phaseTotalVal, { width: 72 }]}>{fmtGBP(phaseVat)}</Text> : null}
                </View>

                {/* Item rows — only show labour/materials rows (not subcontractors/plant overhead rows) */}
                {p.items
                  .filter(i => i.enabled !== false && (i.itemType === 'labour' || i.itemType === 'materials' || !i.itemType))
                  .map((item, ii) => {
                    const itemCost = (Number(item.labour) || 0) + (Number(item.materials) || 0)
                    const itemSell = itemCost * (1 + qMkp / 100)
                    const itemVat  = qVat ? itemSell * VAT : 0
                    return (
                      <View key={ii} style={[S.tableRow, ii % 2 === 1 ? S.tableRowAlt : {}]}>
                        <View style={S.colDesc}>
                          <Text style={S.cellText}>{item.desc || '—'}</Text>
                          {item.notes ? <Text style={S.cellNote}>{item.notes}</Text> : null}
                        </View>
                        <Text style={[S.cellText, S.colQty]}>{String(item.qty ?? '')}</Text>
                        <Text style={[S.cellText, S.colUnit]}>{item.unit || ''}</Text>
                        <Text style={[S.cellText, S.colAmt]}>{fmtGBP(itemSell)}</Text>
                        {qVat ? <Text style={[S.cellText, S.colVat]}>{fmtGBP(itemVat)}</Text> : null}
                      </View>
                    )
                  })}
              </View>
            )
          })}

          {/* ── Totals ── */}
          <View style={S.totalsBox}>
            <View style={S.totalsRow}>
              <Text style={S.totalsLabel}>Subtotal (ex-VAT)</Text>
              <Text style={S.totalsValue}>{fmtGBP(net)}</Text>
            </View>
            {qVat ? (
              <View style={S.totalsRow}>
                <Text style={S.totalsLabel}>VAT (20%)</Text>
                <Text style={S.totalsValue}>{fmtGBP(vat)}</Text>
              </View>
            ) : (
              <Text style={S.vatNote}>* VAT not included</Text>
            )}
            <View style={S.totalsRowFinal}>
              <Text style={S.totalsFinalLabel}>TOTAL</Text>
              <Text style={S.totalsFinalValue}>{fmtGBP(total)}</Text>
            </View>
          </View>

          {/* ── Terms ── */}
          {co.terms ? (
            <View style={S.termsBox}>
              <Text style={S.termsHeading}>Payment Terms & Conditions</Text>
              <Text style={S.termsText}>{co.terms}</Text>
              {co.extra ? <Text style={[S.termsText, { marginTop: 4 }]}>{co.extra}</Text> : null}
            </View>
          ) : null}

          {/* ── Contact — pure string, no nested React elements in Text ── */}
          <Text style={S.contactLine}>{contactStr}</Text>

        </View>

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{co.name || 'Small Build Company Ltd'}</Text>
          <Text style={S.footerText}>{`${co.address || ''} · Registered in England & Wales`}</Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
