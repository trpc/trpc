import { uploadFileSchema } from '~/utils/schemas';
import { writeFileToDisk } from '../../utils/writeFileToDisk';
import { publicProcedure, router } from '../trpc';

export const roomRouter = router({
  sendMessage: publicProcedure
    .input(uploadFileSchema)
    .mutation(async (opts) => {
      return {
        image: await writeFileToDisk(opts.input.image),
      };
    }),
});
