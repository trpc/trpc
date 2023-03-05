import { unstable_zodFileSchema } from '@trpc/server/adapters/zodFileSchema';
import { z } from 'zod';

export const uploadFileSchema = z.object({
  hello: z.string(),
  file1: unstable_zodFileSchema.optional(),
});
