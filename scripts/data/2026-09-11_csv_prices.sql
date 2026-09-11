-- =============================================================================
-- Set prices for books that are currently FREE, from the 51-book price CSV
-- Date:    2026-09-11
-- Source:  oakbridge_ebook_upload_51_priced.csv (column: ebook_price, in ₹)
-- =============================================================================
--
-- What it does
--   * Sets books.price (stored in PAISE, so ₹795 -> 79500) for every ISBN below.
--   * ONLY touches books whose price is still 0 (free). Books that already have
--     a price are never changed, so running this twice is safe.
--   * Users who already added these books to their library KEEP access
--     (library rows are not touched).
--
-- Expected result on 2026-09-11: 45 books updated.
--   (6 ISBNs in the CSV are not on the site yet; they are simply skipped.)
--
-- How to run: see scripts/data/README.md
-- Undo:       2026-09-11_csv_prices_rollback.sql
-- =============================================================================

BEGIN;

CREATE TEMP TABLE csv_prices (isbn text PRIMARY KEY, new_price integer NOT NULL) ON COMMIT DROP;

INSERT INTO csv_prices (isbn, new_price) VALUES
          ('9789391032548',  79500), -- ₹ 795  Accelerating India : 7 Years of Modi Government
          ('9789391032951',  49500), -- ₹ 495  Balance Sheet of the Soul
          ('9788198874085',  49500), -- ₹ 495  Balance Sheet of the Soul (2/e)
          ('9788198348883',  69500), -- ₹ 695  Boss vs Coach: Transforming your Leadership Style
          ('9789391032081',  32500), -- ₹ 325  Case Studies in Ethics, Integrity & Aptitude  -- not on the site yet
          ('9788199305229',  62500), -- ₹ 625  Compulsory English for IAS (Mains) Examination 6/e
          ('9788197288371',  59500), -- ₹ 595  Corporate Sustainability Heroes
          ('9789395764698',  49500), -- ₹ 495  Court Jester  -- not on the site yet
          ('9789389176865',  25000), -- ₹ 250  Day 1 to One Day
          ('9789395764636',  39500), -- ₹ 395  ESM English Studies Manual
          ('9789395764803', 119500), -- ₹1195  Electricity Laws in India – A Comprehensive Analysis with Regulatory P
          ('9788198661111',  65000), -- ₹ 650  Environment and Ecology With Disaster Management 5/e
          ('9789391032197',  55000), -- ₹ 550  Ethics, Integrity and Aptitude  -- not on the site yet
          ('9789395764247',  17500), -- ₹ 175  Fairytales – A Poetry Anthology
          ('9788198661166',  59500), -- ₹ 595  Fun-in-Law
          ('9789395764940',  49500), -- ₹ 495  General Studies Paper I-VI | Mock Test and Previous Year Papers
          ('9788199305205',  79500), -- ₹ 795  Guardians of the Boardroom: A Strategic Guide To Boardroom Excellence,
          ('9789395764858', 105000), -- ₹1050  Handbook on Comparative IPR Law Technology Law and Emerging Legal Doma
          ('9789389176094',  49500), -- ₹ 495  Heroes Amongst Us  -- not on the site yet
          ('9788199305298',  99500), -- ₹ 995  In Service of the Nation
          ('9789395764360',  99500), -- ₹ 995  India 2047 – High Income With Equity
          ('9788198751201',  89500), -- ₹ 895  Indian Polity and Governance (2/e)
          ('9789391032524',  24500), -- ₹ 245  International Organisations, Conferences and Treaties
          ('9788199305274',  29500), -- ₹ 295  International Relations and Foreign Policy of India
          ('9788196413513',  69500), -- ₹ 695  Legal Aptitude & Reasoning LA/LR
          ('9788199888159',  79500), -- ₹ 795  Legal Aptitude & Reasoning LA/LR  2/e (2026-27)
          ('9788199624573',  75000), -- ₹ 750  Master Guide to NTA UGC NET | SET | JRF | PhD Paper 1 (Teaching and Re
          ('9788198874030',  69500), -- ₹ 695  Mastering Governance, Leadership, & Strategic Storytelling
          ('9788199305212',  25000), -- ₹ 250  Mastering the Essay Paper
          ('9789391032692',  39500), -- ₹ 395  Miracles do Happen  -- not on the site yet
          ('9788199624528', 129500), -- ₹1295  Perspectives from and within India and its Neighbourhood
          ('9788199305236',  49500), -- ₹ 495  Pet Care Made Easy
          ('9789395764544',  89500), -- ₹ 895  Practical Guide to Drafting Commercial Contracts 3/e
          ('9788197413582',  35000), -- ₹ 350  Rapid Revision Series: Environment, Ecology & Disaster Management
          ('9789395764162',  99500), -- ₹ 995  Rising Relevance of Quality Control and Bureau of Indian Standards
          ('9788199624511', 109500), -- ₹1095  Sashakt Nari Viksit Bharat – Women-Led Development @ 2047
          ('9788198431196',  49500), -- ₹ 495  Sehall’s Suspended Heart
          ('9788198348821',  59500), -- ₹ 595  Sheroes Amongst Us - Real Women Real Stories
          ('9788198751294',  29500), -- ₹ 295  Social Justice (2/e)  -- not on the site yet
          ('9788199624566',  35000), -- ₹ 350  Stakeholder Management : A Board and C-Suite Level Guide to Engagement
          ('9789395764759',  49500), -- ₹ 495  Tales of Law & Laughter
          ('9788199305267',  45000), -- ₹ 450  Tales of Wagging Tails
          ('9789395764643',  59500), -- ₹ 595  The Definitive Guide to UPSC Success: Crafting Your IAS Journey
          ('9788269286601',  29900), -- ₹ 299  The Good Divorce It’s Not What You Think A Memoir
          ('9788199624597',  49400), -- ₹ 494  The Union of States: Contemporary Political History of India’s Federal
          ('9789395764780',  89500), -- ₹ 895  Transforming HARYANA 9 Incredible Years of Haryana Government
          ('9788197939266', 169500), -- ₹1695  Treatise on the POSH Act - A Critical and Comparative Commentary on th
          ('9789389176759',  59500), -- ₹ 595  UGC-NET Solved PYQs on Psychology
          ('9788198661135',  49500), -- ₹ 495  Unfiltered and Unapologetic
          ('9788198348869',  59500), -- ₹ 595  Yogi @ Corporate Street
          ('9789395764964',  85000)  -- ₹ 850  हरियाणा सरकार के 9 अतुलनीय वर्ष एक नए एवं जीवंत हरियाणा का उदय
;

-- 1) Preview: books that WILL change (should list 45 rows, all with old_price = 0)
SELECT b.isbn, b.title, b.price AS old_price, c.new_price
FROM books b
JOIN csv_prices c ON trim(b.isbn) = c.isbn
WHERE b.price = 0
ORDER BY b.title;

-- 2) Apply
UPDATE books b
SET price = c.new_price,
    updated_at = now()
FROM csv_prices c
WHERE trim(b.isbn) = c.isbn
  AND b.price = 0;

-- 3) Check: free books remaining on the whole site (expected: 0)
SELECT count(*) AS free_books_remaining FROM books WHERE price = 0;

COMMIT;
