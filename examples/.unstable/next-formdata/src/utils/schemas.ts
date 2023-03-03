import { zodFileSchema } from '@trpc/server/adapters/zodFileSchema';
import { z } from 'zod';

export const uploadFileSchema = z.object({
  hello: z.string(),
  file1: zodFileSchema.optional(),
});
