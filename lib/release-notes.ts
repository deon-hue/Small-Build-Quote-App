// What went live and when, in plain English, newest first. Shown in the Owner area's "Change log" next to the Phases & Tasks change history.
// ADD AN ENTRY (at the top) every time something is put live. The exact technical record is the code history on GitHub; this is the readable version.

export interface ReleaseNote {
  /** when it went live, ISO with the UK offset */
  at: string
  title: string
  detail: string
}

export const RELEASE_NOTES: ReleaseNote[] = [
  { at: '2026-10-10T18:13:00+01:00', title: 'New calculator: Raft Foundation', detail: 'Prices a raft from its footprint: bulk dig and soil away, hardcore, blinding, DPM, optional insulation and edge beam, edge formwork, mesh and concrete (optionally pumped), with labour, a quote description and a section drawing. A new sub-phase under Foundations. Not yet opened from Take-off.' },
  { at: '2026-10-10T18:07:00+01:00', title: 'New calculator: Trench Fill Foundation', detail: 'Prices a trench filled with concrete to a set distance below ground, with the wall up to DPC, from the drawn line. A new sub-phase under Foundations, and the default Foundation Type in Take-off now opens this calculator. The labour panel wording now says foundation / parapet wall instead of roof.' },
  { at: '2026-10-10T17:58:00+01:00', title: 'Take-off: strip foundations priced by their calculator', detail: 'A drawn foundation line set to Strip Footing is priced by the Strip Foundation calculator (summary card and full-size window), and a sub-phase picked before drawing carries onto the line. Open Back Office once so the new sub-phase appears in your list.' },
  { at: '2026-10-10T17:46:00+01:00', title: 'New calculator: Strip Foundation (Traditional)', detail: 'Prices a strip foundation from its length: the trench and machine, soil taken away, concrete, blockwork up to DPC (solid or cavity filled), DPC, backfill and labour, with a quote description and section drawing. A new sub-phase under Foundations. Not yet opened from Take-off.' },
  { at: '2026-10-10T17:31:00+01:00', title: 'Owner area: one Change log', detail: 'Software updates and every change to Phases & Tasks now appear together in one list, with filters and search.' },
  { at: '2026-10-10T17:22:00+01:00', title: 'Phase change history', detail: 'The database now records every change to Phases & Tasks: what changed, before and after, who and when. Read it in the Owner area. Needs supabase/bo-change-log.sql.' },
  { at: '2026-10-10T16:46:00+01:00', title: 'AI wording on every sub-phase', detail: 'A "What this covers (for the AI)" box on each sub-phase, with suggested wording for all the built-in ones. The AI quote reads it to choose the right sub-phase. Needs supabase/sub-phase-ai-hint.sql to save your own wording.' },
  { at: '2026-10-10T16:41:00+01:00', title: 'AI quote prefers the calculators and groups phases correctly', detail: 'Each calculator sub-phase is described to the AI, which is told to prefer it over a general phase for the same work. A phase is grouped under the main phase Phases & Tasks puts it in, not the one the AI guessed.' },
  { at: '2026-10-10T16:25:00+01:00', title: 'AI scope of works only covers the work described', detail: 'For a single element such as one wall, the scope no longer lists demolition, foundations, structure and every other default phase.' },
  { at: '2026-10-10T16:17:00+01:00', title: 'AI quote prices a cavity wall from its length and height', detail: 'The AI hands the size it heard to the cavity wall calculator, which prices the wall with its standard settings. Calculator sub-phases start at "Not yet calculated" instead of carrying leftover flat lines.' },
  { at: '2026-10-10T15:50:00+01:00', title: 'Deleted wall build-ups stay deleted', detail: 'Deleted External Walls, Floors, Foundations and Plastering build-ups and their layers are no longer put back, and edited layer names and prices are kept.' },
  { at: '2026-10-10T15:24:00+01:00', title: 'Your edits in Phases & Tasks stick', detail: 'Back Office no longer overwrites the names, order or units you set, and a deleted standard phase, sub-phase or task stays deleted, with a Restore list at the bottom. Needs supabase/bo-deleted-items.sql.' },
  { at: '2026-10-10T14:09:00+01:00', title: 'Standard job types are templates too', detail: 'Rear Extension, Loft Conversion and the rest appear in My templates, empty to start with and quoted the old way until you fill them in.' },
  { at: '2026-10-10T13:54:00+01:00', title: 'My templates', detail: 'Named templates built from the sub-phases in Phases & Tasks, offered when starting a manual quote. Prices, tasks and calculators stay in Phases & Tasks. Needs supabase/quote-templates.sql.' },
  { at: '2026-10-10T11:51:00+01:00', title: 'Subcontractor timesheets: full day, half day or split day', detail: 'A subcontractor can record a half day, or two jobs in one day (each a half day), so a short day is no longer paid as a full day.' },
  { at: '2026-10-10T11:15:00+01:00', title: 'Contacts: row Delete button removed', detail: 'Deleting is done from Tidy up contacts.' },
  { at: '2026-10-10T11:07:00+01:00', title: 'Contacts: deleted contacts stay deleted', detail: 'Xero sync no longer brings back a contact you deleted, optional archive in Xero, and a Tidy up contacts screen to remove many at once with a restore list. Needs supabase/deleted-contacts.sql.' },
  { at: '2026-10-09T20:00:00+01:00', title: 'Dashboard: drag to move and resize cards', detail: 'On a computer, drag a card to move it and drag its right-hand edge to resize it. Cards in a row are the same height.' },
  { at: '2026-10-09T17:57:00+01:00', title: 'Dashboard as a grid of cards', detail: 'Greeting, needs-attention, headline cards, this week on site, active jobs and job margins as cards you can arrange; layout remembered per login.' },
  { at: '2026-10-09T14:29:00+01:00', title: 'Documents: save as subcontractor fixed quote', detail: 'Creates the fixed quote with the emailed document attached, with no bill or job cost, then straight to adding payment stages.' },
  { at: '2026-10-08T16:14:00+01:00', title: 'Subcontractor portal: Talk buttons', detail: 'Dictate "Describe your day" and "What did you work on?" instead of typing.' },
  { at: '2026-10-08T15:59:00+01:00', title: 'Subcontractor notes: Talk button', detail: 'Dictate a note with the phone\'s speech recognition.' },
  { at: '2026-10-08T15:06:00+01:00', title: 'Contact panels by type', detail: 'Clients, subcontractors and suppliers each get the panel that suits them (quotes and jobs, timesheets and pay, spend and bills).' },
  { at: '2026-10-08T14:58:00+01:00', title: 'Contact panel: tidier header', detail: 'Name and window buttons on one line; no + Quote button for subcontractors.' },
  { at: '2026-10-08T14:51:00+01:00', title: 'Subcontractor portal: Fixed-price payments', detail: 'Payments is now "Fixed-price payments" and points day-rate and hourly subcontractors to Timesheets.' },
  { at: '2026-10-08T14:41:00+01:00', title: 'Deleting a portal-sourced weekly day removes the original', detail: 'It no longer reappears in the subcontractor\'s portal.' },
  { at: '2026-10-08T14:38:00+01:00', title: 'Subcontractor portal loads faster', detail: 'Main data, schedule and company calendar load together instead of one after another.' },
  { at: '2026-10-08T14:33:00+01:00', title: 'Subcontractor portal has its own app settings', detail: 'The home-screen icon opens the portal, and the builder\'s screens are no longer flashed to a subcontractor or client.' },
  { at: '2026-10-08T14:18:00+01:00', title: 'Approved portal timesheets go into the weekly timesheet', detail: 'Paid with the week like any logged day; the subcontractor sees approved, then paid.' },
  { at: '2026-10-08T14:01:00+01:00', title: 'Job note photos are more reliable', detail: 'Phone photos in odd formats are converted, clear reasons when a photo can\'t go, and a "Try the photo again" button.' },
  { at: '2026-10-08T13:52:00+01:00', title: 'New subcontractor notes are flagged', detail: 'A red "new" badge on a job\'s Notes button, NEW tags in the Activity Log, and a "Needs your attention" dashboard card.' },
  { at: '2026-10-08T13:19:00+01:00', title: 'Job pickers list jobs that are on site', detail: 'Subcontractor timesheet, notes and preview pickers use jobs that are active and not archived. Needs the updated SQL.' },
  { at: '2026-10-08T13:15:00+01:00', title: 'Job notes: accept the jobs the portal offers', detail: 'Clearer error messages on the notes page.' },
  { at: '2026-10-07T20:26:00+01:00', title: 'Subcontractor Company Calendar: week strip', detail: 'Seven day buttons with dots and a card for the chosen day replace the month grid.' },
  { at: '2026-10-07T20:21:00+01:00', title: 'Subcontractor portal: Add my time and Timesheets split', detail: 'Add my time opens just the form; recorded timesheets have their own page.' },
  { at: '2026-10-07T20:15:00+01:00', title: 'Subcontractor portal home: tiles', detail: 'Tiles open their own page with a Home button; the builder\'s preview matches.' },
  { at: '2026-10-07T20:10:00+01:00', title: 'Subcontractor portal redesign', detail: 'A big readable home screen with stat cards and app-style tiles, and a "Your look" sheet with four tile styles and Normal or Large text.' },
  { at: '2026-10-07T20:00:00+01:00', title: 'Subcontractor job notes with photos', detail: 'Notes and photos against a job, landing in the job\'s Activity Log labelled with their name.' },
  { at: '2026-10-07T19:53:00+01:00', title: 'Calendar tab renamed Company Calendar', detail: 'Shown as plain Calendar only when the company view is switched off for that person.' },
  { at: '2026-10-07T19:45:00+01:00', title: 'Task days: clicking a day picks just that day', detail: 'Fixes Friday appearing to move to Monday; "Every day" is its own button.' },
  { at: '2026-10-07T19:32:00+01:00', title: 'Big Add my time button on the subcontractor dashboard', detail: 'The builder\'s preview shows it too.' },
  { at: '2026-10-07T19:22:00+01:00', title: 'Simpler subcontractor timesheet form', detail: 'Job, date, start, finish and lunch with hours worked out automatically; the describe-your-day AI is an optional shortcut.' },
  { at: '2026-10-07T19:17:00+01:00', title: 'Subcontractor calendar readable on busy days and phones', detail: 'Company work shown as one quiet count per day, with a dot grid on phones.' },
  { at: '2026-10-07T19:06:00+01:00', title: 'Fix: subcontractors locked out of their portal', detail: 'Database function repair so subcontractors can sign in again.' },
  { at: '2026-10-07T19:01:00+01:00', title: 'Subcontractor portal error screens', detail: 'They show which email you are signed in as, with a Sign out button.' },
  { at: '2026-10-07T18:49:00+01:00', title: 'Repair: subcontractors with a client-type login', detail: 'Fixes "Account not linked" and heals it on sign-in.' },
  { at: '2026-10-07T16:16:00+01:00', title: 'Subcontractor Calendar tab', detail: 'Their booked days in green plus the company\'s other jobs in grey, with a per-subcontractor switch.' },
  { at: '2026-10-07T15:57:00+01:00', title: 'Calendar month view shows every task', detail: 'Each week grows to fit instead of hiding extras behind "+N more".' },
  { at: '2026-10-07T14:47:00+01:00', title: 'Subcontractor invites go to the subcontractor portal', detail: 'Invite, app, SMS and WhatsApp links no longer use the client portal ones.' },
]
