import * as z from 'zod';

export const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
