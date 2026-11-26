-- Add 5% GST on top of every catalogue price, then round to the nearest ₹10.
--
-- After this the listed price is GST-INCLUSIVE: the invoice backs the tax out
-- of it (base = price × 100/105, GST = price × 5/105, split CGST/SGST).
--
-- Volumes of a multi-volume set are priced 0 and are skipped, as are free
-- books. A snapshot of the old prices is taken first so the undo script can
-- restore them exactly.

BEGIN;

-- 1. Snapshot (safe to re-run; keeps the first snapshot if one exists)
CREATE TABLE IF NOT EXISTS price_backup_gst_2026_11 AS
SELECT id, price AS old_price, now() AS backed_up_at
FROM books;

-- 2. Uplift + round to nearest ₹10 (prices are stored in paise)
UPDATE books
SET price = ROUND(price * 1.05 / 1000.0) * 1000,
    updated_at = now()
WHERE price > 0;

COMMIT;

-- 3. Check the result
SELECT b.title,
       p.old_price / 100.0 AS was_inr,
       b.price     / 100.0 AS now_inr,
       ROUND((b.price * 5.0 / 105.0) / 100.0, 2) AS gst_component_inr
FROM books b
JOIN price_backup_gst_2026_11 p ON p.id = b.id
WHERE b.price > 0
ORDER BY b.title
LIMIT 20;
