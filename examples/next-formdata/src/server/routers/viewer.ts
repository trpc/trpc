import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '~/utils/writeFileToDisk';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const viewer = router({
  updateProfile: publicProcedure
    .input(
      z.object({
        formData: uploadFileSchema,
      }),
    )
    .mutation(async (opts) => {
      return {
        name: opts.input.formData.name,
        image: await writeFileToDisk(opts.input.formData.image),
      };
    }),
});
