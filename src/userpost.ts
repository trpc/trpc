import * as z from 'zod';
import { toZod } from 'tozod';

type User = {
  name: string;
  age?: number | undefined;
  active: boolean | null;
  posts: Post[];
};

type Post = {
  content: string;
  author: User;
};

export const User: toZod<User> = z.late.object(() => ({
  name: z
    .string()
    .min(5)
    .max(2314)
    .refine(() => false, 'asdf'),
  age: z.number().optional(),
  active: z.boolean().nullable(),

  posts: z.array(Post),
}));

export const Post: toZod<Post> = z.late.object(() => ({
  content: z.string(),
  author: User,
}));
