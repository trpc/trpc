'use server';

import { z } from 'zod';
import { addPostSchema, type Post } from './_data.schema';
import { publicProcedure } from './_trpc';

const posts: Post[] = [
  {
    id: '1',
    title: 'Hello world',
    content: 'This is a test post',
  },
];
const db = {
  posts,
};

export const createPost = publicProcedure
  .input(addPostSchema)
  .mutation(async (opts) => {
    const post = opts.input;
    db.posts.push({
      ...opts.input,
      id: `${Math.random()}`,
    });
    return post;
  });

export const listPosts = publicProcedure.query(() => {
  return db.posts;
});

export const postById = publicProcedure
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .query((opts) => {
    return db.posts.find((post) => post.id === opts.input.id);
  });
