import {
  experimental_createMemoryUploadHandler,
  experimental_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '~/utils/writeFileToDisk';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const viewer = router({
  updateProfile: publicProcedure
    .use(async (opts) => {
      const formData = await experimental_parseMultipartFormData(
        opts.ctx.req,
        experimental_createMemoryUploadHandler(),
      );

      return opts.next({
        rawInput: { formData },
      });
    })
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
