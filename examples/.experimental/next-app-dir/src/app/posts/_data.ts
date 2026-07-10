'use server';

import { revalidatePath } from 'next/cache';
import { RedirectType } from 'next/navigation';
import { z } from 'zod';
import { addPostSchema, type Post } from './_data.schema';
import { db } from './_lib/db';
import { nextProc, notFound, redirect } from './_lib/trpc';

export const addPost = nextProc
  .input(
    addPostSchema.superRefine(async (it, ctx) => {
      const posts = await db.listPosts();
      console.log('posts in db', posts);
      if (posts.some((post) => post.title === it.title)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Title already exists',
          path: ['title'],
        });
      }
    }),
  )
  .mutation(async (opts) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const post: Post = {
      ...opts.input,
      id: `${Math.random()}`,
    };

    await db.addPost(post);
    revalidatePath('/');
    return redirect(`/posts/${post.id}`, RedirectType.push);
  });

export const listPosts = nextProc.query(async () => {
  return await db.listPosts();
});

export const postById = nextProc
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .query(async (opts) => {
    const post = await db.getPost(opts.input.id);
    if (!post) {
      console.warn(`Post with id ${opts.input.id} not found`);
      notFound();
    }
    return post;
  });
