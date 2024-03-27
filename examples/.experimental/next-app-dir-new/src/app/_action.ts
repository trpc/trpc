'use server';

import { randomUUID } from 'node:crypto';
import { db } from '@/db/client';
import { addPostSchema, Post } from '@/db/schema';
import { protectedAction, redirect } from '@/server/trpc';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export const addPost = protectedAction
  .input(
    addPostSchema.superRefine(async (it, ctx) => {
      const posts = await db.query.Post.findFirst({
        where: eq(Post.title, it.title),
      });
      if (posts) {
        ctx.addIssue({
          code: 'custom',
          message: 'Title already exists',
          path: ['title'],
        });
      }
    }),
  )
  .mutation(async (opts) => {
    const id = randomUUID().replace(/-/g, '');
    console.log('run');
    const res = await db.insert(Post).values({
      ...opts.input,
      id,
      authorId: opts.ctx.user.id,
    });
    console.log('res', res);
    revalidatePath('/');
    return redirect(`/${id}`);
  });
