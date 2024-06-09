import type { InferSelectModel } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export const Post = pgTable('post', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id').references(() => Channel.id),

  author: text('name'),
  text: text('text'),

  createdAt: timestamp('created_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
export type PostType = InferSelectModel<typeof Post>;

export const Channel = pgTable('channel', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),

  createdAt: timestamp('created_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
export type ChannelType = InferSelectModel<typeof Channel>;

const PostRelations = relations(Post, ({ one }) => ({
  channel: one(Channel, { fields: [Post.channelId], references: [Channel.id] }),
}));

const ChannelRelations = relations(Channel, ({ many }) => ({
  posts: many(Post),
}));

const queryClient = postgres(process.env.POSTGRES_URL!);
export const db = drizzle(queryClient, {
  schema: { Post, Channel, PostRelations, ChannelRelations },
});
