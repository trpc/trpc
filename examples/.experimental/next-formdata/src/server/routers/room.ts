import {
  experimental_createFormDataMiddleware,
  experimental_createMemoryUploadHandler,
  experimental_isMultipartFormDataRequest,
  experimental_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { publicProcedure, router, t } from '../trpc';

const formDataProcedure = publicProcedure.use(
  experimental_createFormDataMiddleware(t.middleware, {
    uploadHandler: experimental_createMemoryUploadHandler(),
  }),
);

export const roomRouter = router({
  sendMessage: formDataProcedure
    .input(uploadFileSchema)
    .mutation(async (opts) => {
      return {
        image: await writeFileToDisk(opts.input.image),
      };
    }),
});
