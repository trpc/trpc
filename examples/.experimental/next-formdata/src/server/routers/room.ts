import {
  experimental_createMemoryUploadHandler,
  experimental_isMultipartFormDataRequest,
  experimental_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { publicProcedure, router } from '../trpc';

const formDataProcedure = publicProcedure.use(async (opts) => {
  if (!experimental_isMultipartFormDataRequest(opts.ctx.req)) {
    return opts.next();
  }
  const formData = await experimental_parseMultipartFormData(
    opts.ctx.req,
    experimental_createMemoryUploadHandler(),
  );

  return opts.next({
    rawInput: formData,
  });
});

export const roomRouter = router({
  sendMessage: formDataProcedure
    .input(uploadFileSchema)
    .mutation(async (opts) => {
      return {
        image: await writeFileToDisk(opts.input.image),
      };
    }),
});
