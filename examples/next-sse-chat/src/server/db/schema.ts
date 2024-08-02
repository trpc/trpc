import type { InferSelectModel } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { pgTableCreator, text, timestamp } from 'drizzle-orm/pg-core';

const pgTable = pgTableCreator((name) => `sse-chat_${name}`);

export const Post = pgTable('post', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  channelId: text('channel_id')
    .notNull()
    .references(() => Channel.id),

  name: text('name').notNull(),
  text: text('text').notNull(),

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

export const PostRelations = relations(Post, ({ one }) => ({
  channel: one(Channel, { fields: [Post.channelId], references: [Channel.id] }),
}));

export const ChannelRelations = relations(Channel, ({ many }) => ({
  posts: many(Post),
}));
