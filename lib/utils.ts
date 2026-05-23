import type { Quote, QuotePhase, QuoteItem } from './types'

export const VAT = 0.20

export const UNITS = ['Item','m','m²','m³','Nr','Hr','Day','Set','Kg','Tonne']

export function uid(): string {
  return Date.now() + '-' + Math.floor(Math.random() * 10000)
}

export function fmt(n: number): string {
  return '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtK(n: number): string {
  return n >= 1000 ? '£' + (n / 1000).toFixed(0) + 'k' : fmt(n)
}

export function calcItem(i: QuoteItem): number {
  return (Number(i.labour) || 0) + (Number(i.materials) || 0) + (Number(i.plantHire) || 0)
}

export function calcPhase(p: QuotePhase): number {
  return p.items.reduce((s, i) => s + calcItem(i), 0)
}

export function calcItemSell(i: QuoteItem, mkp: number): number {
  return calcItem(i) * (1 + mkp / 100)
}

export function calcPhaseSell(p: QuotePhase, mkp: number): number {
  return p.items.reduce((s, i) => s + calcItemSell(i, mkp), 0)
}

export function quoteTotal(q: Quote): number {
  const net = q.phases.reduce((s, p) => s + calcPhase(p), 0)
  const sub = net * (1 + (q.markup || 0) / 100)
  return sub * (q.vatIncluded ? 1 + VAT : 1)
}

export const STAGE_COLOR: Record<string, string> = {
  planning: '#4a90a4', active: '#7ab533', onhold: '#e67e22', complete: '#9aa3ad',
}
export const STAGE_BADGE: Record<string, string> = {
  planning: 'b-planning', active: 'b-active', onhold: 'b-onhold', complete: 'b-complete',
}
export const STAGE_LABEL: Record<string, string> = {
  planning: 'Planning', active: 'On Site', onhold: 'On Hold', complete: 'Complete',
}
export const Q_BADGE: Record<string, string> = {
  pending: 'b-pending', sent: 'b-sent', accepted: 'b-accepted', declined: 'b-declined',
}
export const Q_LABEL: Record<string, string> = {
  pending: 'Pending', sent: 'Sent', accepted: 'Accepted', declined: 'Declined',
}

export const JOB_TYPES = [
  'Rear Extension','Side Extension','Loft Conversion','Full Refurbishment',
  'Kitchen Extension','Landscaping','New Build','Other',
]

export const JOB_TEMPLATES: Record<string, Array<{phase: string, items: Omit<QuoteItem, 'id'>[]}>> = {
  'Rear Extension': [
    {phase:'Preliminaries & Site Setup',items:[{desc:'Site setup, hoarding, welfare facilities',qty:1,unit:'Item',labour:450,materials:300,notes:''},{desc:'Scaffold erection and hire (8 weeks)',qty:1,unit:'Item',labour:0,materials:1800,notes:''}]},
    {phase:'Demolition & Enabling Works',items:[{desc:'Break out existing rear wall / openings',qty:1,unit:'Item',labour:800,materials:0,notes:'Including skip hire'},{desc:'Strip out internal finishes',qty:1,unit:'Item',labour:400,materials:0,notes:''}]},
    {phase:'Foundations',items:[{desc:'Excavate strip foundations',qty:12,unit:'m',labour:600,materials:0,notes:''},{desc:'Concrete foundations',qty:3.5,unit:'m³',labour:350,materials:700,notes:'C25 mix'},{desc:'Damp proof course',qty:12,unit:'m',labour:150,materials:120,notes:''}]},
    {phase:'Structure — Walls & Frame',items:[{desc:'Blockwork cavity walls',qty:45,unit:'m²',labour:1800,materials:1350,notes:'100mm block, 100mm insulated cavity'},{desc:'Steel beam supply and install (RSJ)',qty:2,unit:'Nr',labour:600,materials:1200,notes:'Structural engineer spec'},{desc:'Padstones',qty:4,unit:'Nr',labour:80,materials:120,notes:''}]},
    {phase:'Roof',items:[{desc:'Flat roof — warm roof build-up',qty:18,unit:'m²',labour:900,materials:1440,notes:'GRP or EPDM finish, 10yr guarantee'},{desc:'Roof joists, insulation and decking',qty:18,unit:'m²',labour:720,materials:810,notes:''},{desc:'Fascias, soffits and guttering',qty:1,unit:'Item',labour:350,materials:380,notes:'UPVC white'}]},
    {phase:'External Doors & Windows',items:[{desc:'Bifold doors supply and install',qty:1,unit:'Set',labour:600,materials:3200,notes:'Aluminium, 3-panel, anthracite grey'},{desc:'Rooflight supply and install',qty:1,unit:'Nr',labour:250,materials:850,notes:'Fixed, double glazed'}]},
    {phase:'First Fix',items:[{desc:'First fix electrics',qty:1,unit:'Item',labour:900,materials:400,notes:'6 double sockets, 8 downlights'},{desc:'First fix plumbing',qty:1,unit:'Item',labour:600,materials:300,notes:'Extend existing heating circuit'},{desc:'Underfloor heating supply and fit',qty:18,unit:'m²',labour:540,materials:900,notes:'Wet system, screed over'}]},
    {phase:'Insulation & Airtightness',items:[{desc:'Floor insulation and screed',qty:18,unit:'m²',labour:540,materials:720,notes:'100mm rigid insulation, 75mm screed'},{desc:'Wall insulation — cavity fill',qty:45,unit:'m²',labour:0,materials:450,notes:'Blown bead'}]},
    {phase:'Plastering & Internal Finishes',items:[{desc:'Plasterboard and skim walls',qty:60,unit:'m²',labour:1200,materials:720,notes:''},{desc:'Plasterboard and skim ceiling',qty:18,unit:'m²',labour:540,materials:360,notes:''}]},
    {phase:'Second Fix & Decoration',items:[{desc:'Second fix electrics',qty:1,unit:'Item',labour:600,materials:300,notes:''},{desc:'Second fix plumbing',qty:1,unit:'Item',labour:400,materials:200,notes:''},{desc:'Internal decoration — 2 coats throughout',qty:1,unit:'Item',labour:800,materials:350,notes:'Walls and ceiling'}]},
    {phase:'External Works & Finishes',items:[{desc:'Make good brickwork to existing',qty:1,unit:'Item',labour:400,materials:200,notes:'Match existing brick as closely as possible'},{desc:'External rendering',qty:1,unit:'Item',labour:600,materials:400,notes:'K-rend or similar'},{desc:'Clear site, final clean',qty:1,unit:'Item',labour:300,materials:0,notes:''}]},
  ],
  'Landscaping': [
    {phase:'Preliminaries & Site Setup',items:[{desc:'Site setup, access, welfare',qty:1,unit:'Item',labour:200,materials:100,notes:''}]},
    {phase:'Clearance & Excavation',items:[{desc:'Strip existing lawn and topsoil',qty:40,unit:'m²',labour:400,materials:0,notes:'Including disposal'},{desc:'Excavation for levels / drainage',qty:1,unit:'Item',labour:500,materials:0,notes:''}]},
    {phase:'Hard Landscaping',items:[{desc:'Patio — porcelain slabs on screed bed',qty:20,unit:'m²',labour:1000,materials:1400,notes:'600x600 porcelain, colour TBC'},{desc:'Decking — composite boards on frame',qty:15,unit:'m²',labour:900,materials:1350,notes:''},{desc:'Gravel pathway with weed membrane',qty:10,unit:'m²',labour:200,materials:150,notes:''}]},
    {phase:'Boundaries & Fencing',items:[{desc:'Closeboard fence panels and posts',qty:15,unit:'m',labour:450,materials:600,notes:'1.8m high, concrete posts'},{desc:'Garden wall — single skin brick',qty:8,unit:'m',labour:640,materials:400,notes:''}]},
    {phase:'Soft Landscaping',items:[{desc:'Topsoil supply and spread',qty:15,unit:'m²',labour:200,materials:300,notes:''},{desc:'Turf supply and lay',qty:20,unit:'m²',labour:300,materials:280,notes:'Premium rolled turf'},{desc:'Planting — shrubs and borders',qty:1,unit:'Item',labour:350,materials:500,notes:'Allowance only, final selection TBC'}]},
    {phase:'External Lighting',items:[{desc:'Low voltage garden lighting supply and install',qty:1,unit:'Item',labour:400,materials:600,notes:'8 spike lights, 2 wall lights'}]},
    {phase:'Clear Site & Final Finish',items:[{desc:'Final clean, remove all waste',qty:1,unit:'Item',labour:200,materials:0,notes:''}]},
  ],
}
