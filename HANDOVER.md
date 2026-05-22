# Small Build Company Ltd — App Handover Document
## For Claude Code / Developer Handover

---

## What This App Is

A full business management web app for a small UK building company. Built as a single
self-contained HTML file. Currently hosted on Netlify as a static site.

**Live URL:** (your Netlify URL here)
**File:** `small-build-company.html` (rename to `index.html` for Netlify)
**Tech:** Vanilla HTML + CSS + JavaScript, no frameworks, no build step required

---

## What's Been Built

### 1. Dashboard
- Live stats: active jobs, open quotes, pipeline value, completed jobs YTD
- Active jobs list with progress bars
- Recent quotes panel
- Job pipeline board (Planning → Quoted → On Site → Snagging → Complete)

### 2. Jobs
- Add, edit, delete jobs
- Fields: client name, job type, address, contract value, stage, start date,
  duration (weeks), weeks done, notes
- Filter by stage (All / On Site / Planning / Complete)
- Progress bar per job based on weeks done vs total
- **Open** button launches the Gantt chart for that job

### 3. Gantt Chart (inside each job)
- Interactive drag-to-move bars (each bar = one project phase)
- Drag right edge to resize phase duration
- Draggable column divider to resize the phase label column
- Phase labels centred in label column
- Day / Week / Month view switcher
- Milestone markers: Start, Mid-point, Completion
- Today line (orange)
- Resize chart height by dragging bottom handle
- Fullscreen (⛶ Expand) button
- Gantt state (phase positions/durations) saved to localStorage per job
- Reset button to restore default layout
- Phases pulled from linked quote automatically

### 4. Quote Builder
- Customer details with **autocomplete dropdown** from saved clients
- Property photo upload (drag & drop or browse, stored as base64)
- Street View link (opens Google Maps for the address)
- Scope of Works / Description text area
- Job type selector (loads phase template automatically)
- Line items per phase: Description, Qty, Unit, Labour £, Materials £,
  Cost (red), Sell Price with markup (green), VAT (blue), Notes
- Markup slider (0–40%) — all sell prices update live
- VAT toggle (20%)
- Summary panel: Your Cost / Markup / Sell Price ex-VAT / VAT / Total
- Save Quote (new or update existing)
- Editing notice banner when editing a saved quote

### 5. Saved Quotes
- List of all saved quotes with status badges
- Status: Pending / Sent / Accepted / Declined (dropdown to change)
- Edit button — loads quote back into builder with all data
- View button — opens preview modal
- Email button — triggers PDF + Outlook email flow
- **Convert to Job** button (appears when status = Accepted)
- Delete button — with option to also delete linked job

### 6. Quote Preview
- **Detailed view** — full line-by-line breakdown (internal use)
- **Client View** toggle — shows scope + phase subtotals + totals only
  (hides individual line items, markup, cost breakdown)
- Print / Save PDF button
- Download as HTML button
- Send via Outlook button

### 7. Email Flow (Outlook)
- Two-step process (browser security prevents direct attachment)
- Step 1: Opens quote in new tab, print dialog fires automatically → Save as PDF
- Step 2: Opens Outlook with recipient, subject, body pre-filled
- Body includes scope of works, quote summary, payment terms
- PDF uses Client View format (clean, no cost breakdown)

### 8. Clients
- Auto-populated when a quote is saved (name, address, email, phone)
- Click any client row to open detail panel showing:
  - Contact details
  - Summary (quotes count, jobs count, accepted value)
  - All linked quotes with Edit / View / Email buttons
  - All linked jobs with Gantt / Edit buttons
  - **+ New Quote for [Name]** button (opens builder pre-filled)
  - **⬡ Add New Job** button (opens job form pre-filled)
- Delete client button (keeps linked quotes/jobs)

### 9. Company Setup (Settings)
- **Logo upload** — PNG/JPG, stored in localStorage, appears on all quotes
- Company name, tagline, contact name, phone, email, address
- Payment terms (appears on every quote)
- Additional terms / exclusions
- All saved to localStorage

---

## Data Storage

Everything stored in **browser localStorage** under these keys:

| Key | Contents |
|-----|----------|
| `sbc_jobs` | Array of job objects |
| `sbc_quotes` | Array of quote objects |
| `sbc_clients` | Array of client objects |
| `sbc_settings` | Company details object |
| `sbc_gantt` | Gantt phase positions per job ID |
| `sbc_logo` | Company logo as base64 data URL |

**Critical limitation:** localStorage is per-device per-browser. Data does NOT
sync between devices. Clearing browser cache wipes all data.

---

## Data Schemas

### Job object
```json
{
  "id": "uid",
  "client": "Mr & Mrs Davies",
  "type": "Rear Extension",
  "address": "14 Thornton Road, London",
  "value": 64000,
  "stage": "active",
  "start": "2026-03-01",
  "weeks": 12,
  "done": 6,
  "notes": "Structural survey booked",
  "quoteId": "linked-quote-uid"
}
```

### Quote object
```json
{
  "id": "uid",
  "ref": "QT-1042",
  "savedDate": "22/05/2026",
  "lastEdited": "23/05/2026",
  "status": "pending",
  "jobType": "Rear Extension",
  "markup": 15,
  "vatIncluded": true,
  "scope": "Scope of works text...",
  "photo": "data:image/jpeg;base64,...",
  "convertedToJob": false,
  "customer": {
    "name": "Mr & Mrs Davies",
    "address": "14 Thornton Road\nLondon SW1 2AB",
    "email": "davies@email.com",
    "phone": "07700 900001"
  },
  "phases": [
    {
      "id": 123,
      "phase": "Foundations",
      "items": [
        {
          "id": 456,
          "desc": "Excavate strip foundations",
          "qty": 12,
          "unit": "m",
          "labour": 600,
          "materials": 0,
          "notes": ""
        }
      ]
    }
  ]
}
```

### Client object
```json
{
  "id": "uid",
  "name": "Mr & Mrs Davies",
  "first": "Mr & Mrs",
  "last": "Davies",
  "phone": "07700 900001",
  "email": "davies@email.com",
  "address": "14 Thornton Road\nLondon SW1 2AB",
  "notes": "",
  "jobs": 0,
  "total": 0,
  "addedFrom": "quote"
}
```

---

## API Key (Anthropic)

The app has an AI scope-writing feature using the Anthropic API.
The key is declared at the top of the file:

```javascript
var ANTHROPIC_API_KEY = 'sk-ant-...your key here...';
```

This is in plain sight in the HTML source — fine for private use,
but should be moved to a backend proxy before making the URL public.

Model used: `claude-haiku-4-5-20251001`

---

## Job Type Templates

Two full templates are built in:
- **Rear Extension** — 11 phases with pre-filled labour/materials rates
- **Landscaping** — 8 phases with pre-filled rates

Other job types (Side Extension, Loft Conversion, Full Refurbishment,
Kitchen Extension, New Build, Other) show a blank template.

---

## Key Functions Reference

| Function | What it does |
|----------|-------------|
| `showPage(id, navEl)` | Navigate between pages |
| `saveQuote()` | Save new or update existing quote |
| `editSaved(id)` | Load saved quote into builder |
| `convertQuoteToJob(qid)` | Pre-fill job form from accepted quote |
| `deleteQuote(id)` | Delete quote, optionally delete linked job |
| `deleteJob(id)` | Delete job, unlinks from quote |
| `deleteClient(cid)` | Delete client only (keeps quotes/jobs) |
| `openJobDetail(jid)` | Open Gantt chart + linked quotes panel |
| `buildInteractiveGantt(containerId, job, phases)` | Render draggable Gantt |
| `switchGanttView(jobId, mode)` | Switch Day/Week/Month view |
| `buildHtml(q)` | Build detailed quote HTML document |
| `buildHtmlClientView(q)` | Build client-facing quote HTML |
| `emailQuoteOutlook(qid)` | Trigger PDF + Outlook email flow |
| `openClientDetail(cid)` | Open client profile modal |
| `upsertClientFromQuote(customer, value)` | Auto-add client from quote |
| `clientSearchInput(val)` | Filter client autocomplete dropdown |
| `selectClient(cid)` | Auto-fill quote form from saved client |
| `generateScope()` | AI scope writer (requires API key) |
| `getLogoDataUrl()` | Get saved logo from localStorage |
| `handleLogoFile(file)` | Upload and save company logo |

---

## What To Build Next (Recommended)

### Priority 1 — Proper database (most important)
Replace localStorage with **Supabase** (free tier):
- Data syncs across all devices
- No risk of losing data on cache clear
- Multiple users (e.g. office + site manager)
- Tables mirror the schemas above exactly

### Priority 2 — User authentication
Add login so the app is private:
- Supabase Auth (free, built-in)
- Or Clerk.dev for a nicer UI
- One account for the whole company

### Priority 3 — Convert to React/Next.js
The app is currently vanilla JS — works fine but:
- React would make it easier to maintain and extend
- Next.js gives you API routes (solve the API key exposure issue)
- Can be deployed to Vercel for free with auto-deploys from GitHub

### Priority 4 — Invoice module
Currently missing:
- Generate invoices from jobs (stage payments)
- Track paid / outstanding / overdue
- Link to quotes and jobs
- Similar PDF/email flow to quotes

### Priority 5 — Email sending via API
Currently uses mailto: (opens Outlook)
- Replace with **Resend** or **SendGrid** API
- Send emails directly from the app
- Proper HTML email templates
- Email history logged against each quote/client

### Priority 6 — Document storage
Currently photos stored as base64 in localStorage (size limited):
- Move to **Supabase Storage** or **Cloudinary**
- Store quote PDFs, site photos, planning documents per job
- Access from any device

---

## Suggested Stack for Rebuild

```
Frontend:  Next.js 14 (App Router)
Database:  Supabase (PostgreSQL + Auth + Storage)
Hosting:   Vercel (free tier, auto-deploy from GitHub)
Email:     Resend API
PDF:       react-pdf or Puppeteer
Styling:   Tailwind CSS (keeping the same colour palette)
```

Colours to preserve:
```css
--slate:   #2b2f33   /* sidebar, headers */
--moss:    #7ab533   /* lime green accent */
--terra:   #c0392b   /* danger/warning */
--sky:     #4a90a4   /* info/secondary */
--paper:   #f0f2f4   /* page background */
--border:  #dde1e5   /* borders */
```

---

## Files in This Handover

| File | Description |
|------|-------------|
| `small-build-company.html` | Complete working app — rename to index.html for Netlify |
| `HANDOVER.md` | This document |

---

*Built in Claude.ai (claude.ai) — May 2026*
*Hand this document to Claude Code along with the HTML file to continue development.*
