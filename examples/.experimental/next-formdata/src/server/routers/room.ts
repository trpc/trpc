import {
  experimental_createMemoryUploadHandler,
  experimental_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { z } from 'zod';
import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { publicProcedure, router } from '../trpc';

function isPlainObject(obj: unknown): obj is object {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj);
}

const roomProcedure = publicProcedure.input(
  z.object({
    roomId: z.string(),
  }),
);
export const roomRouter = router({
  sendMessage: roomProcedure
    .use(async (opts) => {
      const formData = await experimental_parseMultipartFormData(
        opts.ctx.req,
        experimental_createMemoryUploadHandler(),
      );

      return opts.next({
        rawInput: isPlainObject(opts.rawInput)
          ? {
              ...opts.rawInput,
              formData,
            }
          : { formData },
      });
    })
    .input(
      z.object({
        formData: uploadFileSchema,
      }),
    )
    .mutation(async (opts) => {
      opts.input.roomId;
      return {
        image: await writeFileToDisk(opts.input.formData.image),
        document:
          opts.input.formData.document &&
          (await writeFileToDisk(opts.input.formData.document)),
      };
    }),
});
