import { z } from 'zod';

export const postSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
});

export type Post = z.infer<typeof postSchema>;

export const addPostSchema = postSchema.omit({ id: true });
