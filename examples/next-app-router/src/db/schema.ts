import { relations } from 'drizzle-orm';
import {
  int,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import type { AdapterAccountType } from 'next-auth/adapters';
import { z } from 'zod';

export const Post = sqliteTable('post', {
  id: int('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  authorId: text('authorId')
    .notNull()
    .references(() => User.id, { onDelete: 'cascade' }),
});

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().min(1),
  content: z.string().min(1),
}).omit({
  id: true,
  createdAt: true,
  authorId: true,
});

export const User = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => `usr_` + crypto.randomUUID().replace(/-/g, '')),
  name: text('name').notNull(),
  email: text('email').notNull(),
  hashedPassword: text('hashedPassword'),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
});

export const Account = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => User.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const PostRelations = relations(Post, ({ one }) => ({
  user: one(User, { fields: [Post.authorId], references: [User.id] }),
}));

export const UserRelations = relations(User, ({ many }) => ({
  accounts: many(Account),
  posts: many(Post),
}));

export const AccountRelations = relations(Account, ({ one }) => ({
  user: one(User, { fields: [Account.userId], references: [User.id] }),
}));
