-- ============================================================
-- Help page content: FAQs and video links, edited by the platform owner in the owner area.
--
-- • help_items            one row per FAQ or video link. Readable by signed-in contractors (published rows only); nobody can
--                         write to it directly — only the owner_help_* functions below, which need the owner's two-step login.
-- • owner_help_list()     every item (including unpublished) for the owner's editor
-- • owner_help_save(...)  add or edit one item          (writes an owner audit-log entry)
-- • owner_help_delete(id) delete one item               (writes an owner audit-log entry)
-- A starter set of FAQs is added only if the table is empty. Safe to run more than once.
-- Run after owner-area.sql (it uses _owner_require / _owner_audit). Staging first, then live.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS help_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('faq', 'video')),
  category    TEXT NOT NULL DEFAULT 'Getting started' CHECK (char_length(category) BETWEEN 1 AND 80),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  url         TEXT CHECK (url IS NULL OR (url ~* '^https?://[^[:space:]]+$' AND char_length(url) <= 600)),
  sort_order  INTEGER NOT NULL DEFAULT 100,
  published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE help_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON help_items FROM anon, authenticated;
GRANT SELECT ON help_items TO authenticated;
DROP POLICY IF EXISTS help_items_read ON help_items;
CREATE POLICY help_items_read ON help_items FOR SELECT TO authenticated
  USING (published AND is_contractor());

-- ── Owner functions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION owner_help_list()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  PERFORM _owner_require();
  RETURN COALESCE((SELECT json_agg(row_to_json(h) ORDER BY h.category, h.sort_order, h.created_at) FROM help_items h), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION owner_help_save(
  p_id UUID, p_kind TEXT, p_category TEXT, p_title TEXT, p_body TEXT, p_url TEXT, p_sort INTEGER, p_published BOOLEAN
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind  TEXT := lower(btrim(COALESCE(p_kind, '')));
  v_cat   TEXT := left(btrim(COALESCE(p_category, '')), 80);
  v_title TEXT := left(btrim(COALESCE(p_title, '')), 200);
  v_body  TEXT := left(btrim(COALESCE(p_body, '')), 8000);
  v_url   TEXT := NULLIF(btrim(COALESCE(p_url, '')), '');
  v_id    UUID;
BEGIN
  PERFORM _owner_require();
  IF v_kind NOT IN ('faq', 'video') THEN RETURN json_build_object('error', 'bad_kind'); END IF;
  IF v_title = '' THEN RETURN json_build_object('error', 'title_required'); END IF;
  IF v_cat = '' THEN v_cat := 'General'; END IF;
  IF v_url IS NOT NULL AND (v_url !~* '^https?://[^[:space:]]+$' OR char_length(v_url) > 600) THEN
    RETURN json_build_object('error', 'bad_url');
  END IF;
  IF v_kind = 'video' AND v_url IS NULL THEN RETURN json_build_object('error', 'video_needs_link'); END IF;
  IF v_kind = 'faq' AND v_body = '' THEN RETURN json_build_object('error', 'answer_required'); END IF;

  IF p_id IS NULL THEN
    INSERT INTO help_items (kind, category, title, body, url, sort_order, published)
    VALUES (v_kind, v_cat, v_title, v_body, v_url, COALESCE(p_sort, 100), COALESCE(p_published, TRUE))
    RETURNING id INTO v_id;
    PERFORM _owner_audit('help_add', NULL, jsonb_build_object('title', v_title, 'kind', v_kind));
  ELSE
    UPDATE help_items
       SET kind = v_kind, category = v_cat, title = v_title, body = v_body, url = v_url,
           sort_order = COALESCE(p_sort, 100), published = COALESCE(p_published, TRUE), updated_at = NOW()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN json_build_object('error', 'not_found'); END IF;
    PERFORM _owner_audit('help_edit', NULL, jsonb_build_object('title', v_title, 'kind', v_kind));
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION owner_help_delete(p_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT;
BEGIN
  PERFORM _owner_require();
  DELETE FROM help_items WHERE id = p_id RETURNING title INTO v_title;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  PERFORM _owner_audit('help_delete', NULL, jsonb_build_object('title', v_title));
  RETURN json_build_object('ok', true);
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['owner_help_list()', 'owner_help_save(uuid,text,text,text,text,text,integer,boolean)', 'owner_help_delete(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ── Starter FAQs (only when the table is empty; edit or delete them freely in the owner area) ──
INSERT INTO help_items (kind, category, title, body, sort_order)
SELECT 'faq', v.category, v.title, v.body, v.sort_order
FROM (VALUES
  ('Getting started', 'How do I set up my company?',
   E'Open Company Setup in the menu and fill in your company name, address, phone, email and logo.\n\nThese details appear on your quotes, contracts and in your clients'' portal, so it is worth getting them right first.', 10),
  ('Getting started', 'How do I add a client?',
   E'Open Contacts and add a new contact, or simply type the customer''s details into a new quote. A customer entered on a quote is saved to Contacts for you.\n\nIf you want the client to see their own portal, make sure their email address is saved on their contact.', 20),
  ('Getting started', 'How do I install the app on my phone?',
   E'Open app.buildospro.ai in your phone''s browser and sign in. Then use the browser''s Share or menu button and choose "Add to Home Screen". It then opens like any other app.', 30),
  ('Quotes', 'How do I create a quote?',
   E'Choose New Quote, pick the job type, enter the customer and write the scope of works. Then price the work and save it. For a simple job use Quick Quote instead.\n\nSaved quotes are in Saved Quotes, where you can send them to the client.', 10),
  ('Quotes', 'What happens when a client accepts my quote?',
   E'An accepted quote is locked, so the price and scope the client agreed cannot be changed by accident.\n\nIf the work changes afterwards, add a note in the "Changes to the scope" box on the quote. If the price changes, use a Variation. The original quote is never altered.', 20),
  ('Client portal', 'What does my client see in their portal?',
   E'Your clients sign in with the email address saved on their contact. They can see their quotes, variations, invoices, contracts and the build plan, and they can approve quotes and variations and sign contracts online.\n\nTo see exactly what a client sees, open Contacts, choose the client and open their portal preview.', 10),
  ('Client portal', 'My client says their portal is empty',
   E'The portal matches the email address the client signs in with to the email saved on their contact, and the contact''s name to the name on the job. Check both match exactly.\n\nAlso avoid using your own sign-in email for a test client, because the system treats that account as yours, not as a client.', 20),
  ('Contracts', 'How do I send a contract to a client?',
   E'Open the job and choose Contract. Check the details, sign as the builder, then choose Send for signature. The client gets an email with a link straight to their portal, where they can read it and sign online.\n\nYou are emailed when they have signed, and the signed copy is saved with the job.', 10),
  ('Contracts', 'How do I give the client the plans?',
   E'On the Jobs page open the job''s files, upload the plan and choose the type "Plan" (or "Document" for anything else). Plans and documents show beside the contract on the client''s Contracts tab, and you can name them in the contract''s "Drawings referenced" box.', 20),
  ('Money', 'Can I connect my accounts software?',
   E'Yes. Each company connects its own Xero account, so your accounts are never mixed with anyone else''s.', 10),
  ('Your account', 'Is my information private from other builders?',
   E'Yes. Every company''s quotes, jobs, clients, prices and documents are kept completely separate. No other builder can see yours.', 10),
  ('Your account', 'Something is not working. How do I tell you?',
   E'Use the "Report a problem" button in the corner of the screen and tell us what you were doing and what you expected to happen. It goes straight to us, along with the page you were on.', 20)
) AS v(category, title, body, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM help_items);

COMMIT;
