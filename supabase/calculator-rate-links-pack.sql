-- calculator-rate-links-pack.sql
-- Lets a calculator cost line be linked to a Back Office product that is sold in a DIFFERENT unit, by saying how much of the line's unit one of the product
-- covers. Example: the breather membrane line is priced per m², your product is a 50 m² roll at £120: link it with "1 roll covers 50 m²" and the line takes
-- £2.40 per m². per_unit holds that number (1 = the units are the same, as before). Safe to run more than once. Staging first, then live.
-- (Without it, links to products in the same unit work as before; the calculators just won't offer a pack size.)

ALTER TABLE public.calculator_rate_links
  ADD COLUMN IF NOT EXISTS per_unit NUMERIC NOT NULL DEFAULT 1 CHECK (per_unit > 0);
