-- Undo for sent-items.sql: removes the "Sent to them" records. (The files they point to stay in storage under <user>/sent/ until removed there.)
DROP TABLE IF EXISTS public.sent_items;
