// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const studies = sqliteTable('studies', { id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(), payload: text('payload').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull() });
export const budgets = sqliteTable('budgets', { id: text('id').primaryKey(), used: integer('used').notNull().default(0) });
