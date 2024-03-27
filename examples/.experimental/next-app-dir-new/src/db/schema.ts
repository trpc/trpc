import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';

export const Post = sqliteTable('post', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
});

export const addPostSchema = createInsertSchema(Post).omit({
  id: true,
  authorId: true,
});
