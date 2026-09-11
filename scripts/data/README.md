# One-off data scripts

Scripts in this folder change **data** in the production database. They are not
part of the app and are not run automatically. Run each one once, by hand.

## 2026-09-11_csv_prices.sql: make the 45 free books paid

Sets the price of every book that is currently free (price = 0) to its
`ebook_price` from `oakbridge_ebook_upload_51_priced.csv`. Prices are stored in
paise (₹795 is stored as `79500`).

- Only books with price 0 change. Paid books are never touched.
- Users who already added these books to their library keep access.
- Safe to run twice: the second run updates 0 rows.
- Expected: **`UPDATE 45`**, then `free_books_remaining = 0`.
- 6 ISBNs in the CSV aren't on the site yet. They are skipped.

### Run it

You need the production `DATABASE_URL`. It's in the backend's `.env` file on the server.

**Option A: database provider's SQL editor** (Neon / AWS RDS query editor)
Paste the whole file into the editor and run it.

**Option B: from the server**, in the backend folder:

```bash
# 1. Back up the current prices first (a small CSV file on the server)
psql "$DATABASE_URL" -c "\copy (select id, isbn, title, price from books) to 'books_prices_backup_2026-09-11.csv' csv header"

# 2. Apply
psql "$DATABASE_URL" -f scripts/data/2026-09-11_csv_prices.sql
```

If `psql` is not installed on the server, run it through Docker instead:

```bash
docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" < scripts/data/2026-09-11_csv_prices.sql
```

No app restart or deploy is needed. The site shows the new prices immediately.

### Undo

```bash
psql "$DATABASE_URL" -f scripts/data/2026-09-11_csv_prices_rollback.sql
```

This makes the 45 books free again. A book is only reset if its price is still
the value the script set.
