import {
     boolean,
     integer,
     pgTable,
     text,
     timestamp,
     uuid,
     varchar,
} from 'drizzle-orm/pg-core';

export const banners = pgTable('banners', {
     id: uuid('id').defaultRandom().primaryKey(),
     title: varchar('title', { length: 255 }).notNull(),
     subtitle: text('subtitle'),
     image_url: text('image_url').notNull(),
     image_alt: text('image_alt').default('').notNull(),
     link_url: text('link_url'),
     button_text: varchar('button_text', { length: 50 }),
     is_active: boolean('is_active').default(true).notNull(),
     order: integer('order').default(0).notNull(),
     createdAt: timestamp('created_at').defaultNow().notNull(),
     updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
