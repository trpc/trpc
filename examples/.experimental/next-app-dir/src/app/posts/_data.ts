'use server';

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

export const addPost = dataLayer.action(
  protectedProcedure.input(addPostSchema).mutation(async (opts) => {
    const post = opts.input;
    db.posts.push({
      ...opts.input,
      id: `${Math.random()}`,
    });
    return post;
  }),
);

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
