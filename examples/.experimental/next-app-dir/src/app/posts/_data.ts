'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect, RedirectType } from 'next/navigation';
import { z } from 'zod';
import { addPostSchema, type Post } from './_data.schema';
import { nextProc } from './_lib/trpc';

const posts: Post[] = [
  {
    id: '1',
    title: 'Hello world',
    content: 'This is a test post',
  },
  {
    id: '2',
    title: 'Second post',
    content: 'This is another test post',
  },
];
const db = {
  posts,
};

export const addPost = nextProc
  .input(
    addPostSchema.superRefine((it, ctx) => {
      if (db.posts.some((post) => post.title === it.title)) {
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

    db.posts.push(post);
    revalidatePath('/');

    redirect(`/posts/${post.id}`, RedirectType.push);
  });

export const listPosts = nextProc.query(() => {
  return db.posts;
});

export const postById = nextProc
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .query((opts) => {
    return db.posts.find((post) => post.id === opts.input.id) ?? notFound();
  });
