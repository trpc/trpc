import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { middleware, publicProcedure, router } from '../trpc';

const formDataProcedure = publicProcedure;

export const roomRouter = router({
  sendMessage: formDataProcedure
    .input(uploadFileSchema)
    .mutation(async (opts) => {
      return {
        image: await writeFileToDisk(opts.input.image),
      };
    }),
});
