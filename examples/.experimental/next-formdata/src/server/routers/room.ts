import {
  experimental_createFormDataMiddleware,
  experimental_createMemoryUploadHandler,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { middleware, publicProcedure, router } from '../trpc';

const formDataProcedure = publicProcedure.use(
  experimental_createFormDataMiddleware(middleware, {
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
