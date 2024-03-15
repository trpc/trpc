'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { z } from 'zod';
import { addPostSchema, type Post } from './_data.schema';
import { dataLayer, protectedProcedure, publicProcedure } from './_trpc';

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

const addPost = protectedProcedure
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
export const formDataAction = dataLayer.action(addPost);

export const simpleAddPost = dataLayer.invokeAction(addPost);

export const listPosts = dataLayer.data(
  publicProcedure.query(() => {
    return db.posts;
  }),
);

export const postById = dataLayer.data(
  publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query((opts) => {
      return db.posts.find((post) => post.id === opts.input.id);
    }),
);
