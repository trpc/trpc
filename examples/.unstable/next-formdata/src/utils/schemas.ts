import {
  unstable_createZodFileSchema,
  unstable_zodFileSchema,
  unstable_zodFileSchemaOptional,
} from '@trpc/server/adapters/zodFileSchema';
import { z } from 'zod';

export const uploadFileSchema = z.object({
  name: z.string().min(5),
  image: unstable_createZodFileSchema({
    types: ['image/png'],
  }),
  document: unstable_createZodFileSchema({ optional: true }),
});
