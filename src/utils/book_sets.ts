import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/db';
import { books } from '../db/schemas';

/**
 * Multi-volume sets.
 *
 * A set is an ordinary `books` row with `is_set = true`. Its volumes are also
 * `books` rows, each pointing back at the set through `set_parent_id`.
 *
 *  - Only rows with `set_parent_id IS NULL` are listed in the store, searched,
 *    recommended, announced by email or added to a cart.
 *  - A volume is never bought on its own: reading a volume is allowed when the
 *    user is entitled to its parent set. Every entitlement check therefore runs
 *    `entitlement_book_id()` on the id it was given before looking anything up.
 */

export interface VolumeSummary {
     id: string;
     volume_number: number | null;
     volume_label: string | null;
     total_pages: number;
     total_chapters: number;
     isbn: string;
     cover_image_url: string;
}

/**
 * The book whose purchase/shelf/subscription grants access to `book_id`.
 * For a volume that is its parent set; for anything else it is the book itself.
 */
export const entitlement_book_id = async (book_id: string): Promise<string> => {
     const [row] = await db
          .select({ set_parent_id: books.set_parent_id })
          .from(books)
          .where(eq(books.id, book_id))
          .limit(1);

     return row?.set_parent_id || book_id;
};

/** Volumes of a set, in reading order. Empty for a book that is not a set. */
export const get_volumes = async (set_id: string): Promise<VolumeSummary[]> => {
     return db
          .select({
               id: books.id,
               volume_number: books.volume_number,
               volume_label: books.volume_label,
               total_pages: books.total_pages,
               total_chapters: books.total_chapters,
               isbn: books.isbn,
               cover_image_url: books.cover_image_url,
          })
          .from(books)
          .where(eq(books.set_parent_id, set_id))
          .orderBy(asc(books.volume_number), asc(books.createdAt));
};

/** How many volumes each of these books has. Books with none are left out. */
export const get_volume_counts = async (
     book_ids: string[]
): Promise<Record<string, number>> => {
     if (book_ids.length === 0) return {};

     const rows = await db
          .select({ set_parent_id: books.set_parent_id })
          .from(books)
          .where(
               and(
                    isNotNull(books.set_parent_id),
                    inArray(books.set_parent_id, book_ids)
               )
          );

     const counts: Record<string, number> = {};
     for (const row of rows) {
          if (!row.set_parent_id) continue;
          counts[row.set_parent_id] = (counts[row.set_parent_id] || 0) + 1;
     }
     return counts;
};

/** The next free volume number in a set (1-based). */
export const next_volume_number = async (set_id: string): Promise<number> => {
     const volumes = await get_volumes(set_id);
     const highest = volumes.reduce(
          (max, v) => Math.max(max, v.volume_number || 0),
          0
     );
     return highest + 1;
};

const ROMAN = [
     '',
     'I',
     'II',
     'III',
     'IV',
     'V',
     'VI',
     'VII',
     'VIII',
     'IX',
     'X',
     'XI',
     'XII',
];

/** "Volume III" for number 3; falls back to plain digits past XII. */
export const default_volume_label = (volume_number: number): string =>
     `Volume ${ROMAN[volume_number] || volume_number}`;
