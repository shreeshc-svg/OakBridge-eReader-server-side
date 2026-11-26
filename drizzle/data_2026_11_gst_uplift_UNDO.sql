-- UNDO for data_2026_11_gst_uplift.sql — restores the exact prices captured
-- in the snapshot table.

BEGIN;

UPDATE books b
SET price = p.old_price,
    updated_at = now()
FROM price_backup_gst_2026_11 p
WHERE p.id = b.id
  AND b.price <> p.old_price;

COMMIT;

-- Confirm nothing differs from the snapshot any more
SELECT count(*) AS still_changed
FROM books b
JOIN price_backup_gst_2026_11 p ON p.id = b.id
WHERE b.price <> p.old_price;

-- Drop the snapshot only once you are sure:
-- DROP TABLE price_backup_gst_2026_11;
