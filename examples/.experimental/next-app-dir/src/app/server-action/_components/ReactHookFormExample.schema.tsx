import { z } from 'zod';

export const rhfActionSchema = z.object({
  text: z.string().min(1),
});
