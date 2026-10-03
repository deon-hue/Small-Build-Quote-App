-- seed-demo-data.sql — fills the STAGING database with a made-up company so there is something to test with.
-- Everything here is fictional (example.com addresses, 000 phone numbers). Run ONLY on the "BuildOS Staging" project,
-- AFTER you have created your staging login (Authentication → Users). It attaches the demo data to the first user.
-- Safe to run more than once: it replaces the demo company details and skips records that already exist.

DO $seed$
DECLARE
  v_user UUID;
  v_phases JSONB;
BEGIN
  -- Safety: never on the live database
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'deon@smallbuildcompany.com') THEN
    RAISE EXCEPTION 'STOP: this looks like the LIVE database (it has the live owner account). Nothing was changed.';
  END IF;

  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No user found. Create your staging login first (Authentication → Users → Add user), then run this again.';
  END IF;

  -- ── The demo company (shown on quotes, the portal, emails) ─────────────────
  INSERT INTO settings (user_id, company_name, tagline, contact, phone, email, address, website,
                        vat_registered, vat_number, vat_rate, default_markup, company_number,
                        invoice_bank_name, invoice_account_name, invoice_sort_code, invoice_account_number)
  VALUES (v_user, 'Demo Builders Ltd', 'Extensions, lofts and renovations', 'Alex Demo', '01753 000000',
          'hello@demo-builders.example', E'1 Test Street\nWindsor SL4 1AA', 'www.demo-builders.example',
          TRUE, 'GB 000 0000 00', 20, 20, '00000000',
          'Demo Bank', 'Demo Builders Ltd', '00-00-00', '00000000')
  ON CONFLICT (user_id) DO UPDATE SET
    company_name = EXCLUDED.company_name, tagline = EXCLUDED.tagline, contact = EXCLUDED.contact,
    phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address, website = EXCLUDED.website,
    vat_registered = EXCLUDED.vat_registered, vat_number = EXCLUDED.vat_number, vat_rate = EXCLUDED.vat_rate,
    default_markup = EXCLUDED.default_markup, company_number = EXCLUDED.company_number;

  -- ── Two demo clients ───────────────────────────────────────────────────────
  INSERT INTO clients (user_id, name, first_name, last_name, phone, email, address, notes)
  SELECT v_user, 'Jane Sample', 'Jane', 'Sample', '07700 900001', 'jane.sample@example.com',
         E'12 Example Road\nWindsor SL4 2AB', 'Demo client — rear extension'
  WHERE NOT EXISTS (SELECT 1 FROM clients WHERE user_id = v_user AND email = 'jane.sample@example.com');

  INSERT INTO clients (user_id, name, first_name, last_name, phone, email, address, notes)
  SELECT v_user, 'Tom Testington', 'Tom', 'Testington', '07700 900002', 'tom.testington@example.com',
         E'3 Placeholder Lane\nSlough SL1 3CD', 'Demo client — loft conversion'
  WHERE NOT EXISTS (SELECT 1 FROM clients WHERE user_id = v_user AND email = 'tom.testington@example.com');

  -- ── Demo quote phases (every sub-phase has the five typed rows) ────────────
  v_phases := '[
    {"id":1,"parentPhase":"Phase 1 – Site Setup & Preparation","phase":"Site Establishment","taskName":"Welfare, hoarding and site protection","items":[
      {"id":1,"desc":"Site management and welfare","qty":1,"unit":"Item","labour":900,"materials":0,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"labour"},
      {"id":2,"desc":"Hoarding and protection","qty":1,"unit":"Item","labour":0,"materials":450,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"materials"},
      {"id":3,"desc":"Skips and welfare unit hire","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":700,"subcontractors":0,"other":0,"notes":"","itemType":"plant"},
      {"id":4,"desc":"","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"subcontractors"},
      {"id":5,"desc":"Building Control fee","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":0,"other":350,"notes":"","itemType":"other"}]},
    {"id":2,"parentPhase":"Phase 2 – Groundworks & Foundations","phase":"Excavation and Foundations","taskName":"Strip foundations to the rear extension","items":[
      {"id":6,"desc":"Excavation and concrete","qty":1,"unit":"Item","labour":2800,"materials":0,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"labour"},
      {"id":7,"desc":"Concrete and reinforcement","qty":1,"unit":"Item","labour":0,"materials":3200,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"materials"},
      {"id":8,"desc":"Mini digger hire","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":1100,"subcontractors":0,"other":0,"notes":"","itemType":"plant"},
      {"id":9,"desc":"Drainage runs","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":1800,"other":0,"notes":"","itemType":"subcontractors"},
      {"id":10,"desc":"","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"other"}]},
    {"id":3,"parentPhase":"Phase 3 – Structural Shell","phase":"External Walls and Blockwork","taskName":"Cavity walls to the new extension","items":[
      {"id":11,"desc":"Bricklaying labour","qty":1,"unit":"Item","labour":6200,"materials":0,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"labour"},
      {"id":12,"desc":"Bricks, blocks, insulation","qty":1,"unit":"Item","labour":0,"materials":7400,"plantHire":0,"subcontractors":0,"other":0,"notes":"","itemType":"materials"},
      {"id":13,"desc":"Scaffold","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":1600,"subcontractors":0,"other":0,"notes":"","itemType":"plant"},
      {"id":14,"desc":"Structural steel (RSJ)","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":2400,"other":0,"notes":"","itemType":"subcontractors"},
      {"id":15,"desc":"Structural engineer fee","qty":1,"unit":"Item","labour":0,"materials":0,"plantHire":0,"subcontractors":0,"other":650,"notes":"","itemType":"other"}]}
  ]'::jsonb;

  -- ── Two demo quotes ────────────────────────────────────────────────────────
  INSERT INTO quotes (user_id, ref, saved_date, last_edited, status, job_type, markup, vat_included, scope, customer, phases, title)
  SELECT v_user, 'QT-DEMO-1', to_char(now(), 'DD Mon YYYY'), to_char(now(), 'DD Mon YYYY'), 'sent', 'Rear Extension', 20, TRUE,
         'Single storey rear extension, 4m x 5m, kitchen diner with bifold doors.',
         '{"name":"Jane Sample","address":"12 Example Road, Windsor SL4 2AB","email":"jane.sample@example.com","phone":"07700 900001"}'::jsonb,
         v_phases, 'Rear extension'
  WHERE NOT EXISTS (SELECT 1 FROM quotes WHERE user_id = v_user AND ref = 'QT-DEMO-1');

  INSERT INTO quotes (user_id, ref, saved_date, last_edited, status, job_type, markup, vat_included, scope, customer, phases, title)
  SELECT v_user, 'QT-DEMO-2', to_char(now(), 'DD Mon YYYY'), to_char(now(), 'DD Mon YYYY'), 'draft', 'Loft Conversion', 20, TRUE,
         'Rear dormer loft conversion with two bedrooms and a shower room.',
         '{"name":"Tom Testington","address":"3 Placeholder Lane, Slough SL1 3CD","email":"tom.testington@example.com","phone":"07700 900002"}'::jsonb,
         v_phases, 'Loft conversion'
  WHERE NOT EXISTS (SELECT 1 FROM quotes WHERE user_id = v_user AND ref = 'QT-DEMO-2');

  -- ── One demo job ───────────────────────────────────────────────────────────
  INSERT INTO jobs (user_id, client, type, address, value, stage, start_date, weeks, notes, title)
  SELECT v_user, 'Jane Sample', 'Rear Extension', E'12 Example Road\nWindsor SL4 2AB', 54000, 'planning',
         current_date + 14, 10, 'Demo job for testing', 'Rear extension'
  WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE user_id = v_user AND client = 'Jane Sample' AND type = 'Rear Extension');
END
$seed$;
