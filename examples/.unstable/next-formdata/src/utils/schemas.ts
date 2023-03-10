import {
  unstable_createZodFileSchema,
  unstable_zodFileSchema,
  unstable_zodFileSchemaOptional,
} from '@trpc/server/adapters/zodFileSchema';
import { z } from 'zod';

export const uploadFileSchema = z.object({
  hello: z.string(),
  file1: unstable_createZodFileSchema({
    types: ['image/png'],
  }),
});
