import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { uploadFileSchema } from '~/utils/schemas';
import { publicProcedure, router } from '../trpc';

async function writeFileToDisk(file: File) {
  const rootDir = __dirname + '/../../../../..';

  const nonce = Date.now();
  const fileDir = path.resolve(`${rootDir}/public/uploads/${nonce}`);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  console.log('Writing', file.name, 'to', fileDir);
  const fd = fs.createWriteStream(path.resolve(`${fileDir}/${file.name}`));

  for await (const chunk of Readable.fromWeb(file.stream() as ReadableStream)) {
    fd.write(chunk);
  }
  fd.end();

  return {
    url: `/uploads/${nonce}/${file.name}`,
    name: file.name,
  };
}

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
    .use(async ({ ctx, next, input, rawInput }) => {
      const formData = await unstable_parseMultipartFormData(
        ctx.req,
        unstable_createMemoryUploadHandler(),
      );

      return next({
        rawInput: isPlainObject(rawInput)
          ? {
              ...rawInput,
              formData,
            }
          : { formData },
      } as any);
    })
    .input(
      z.object({
        formData: uploadFileSchema,
      }),
    )
    .mutation(async (opts) => {
      return {
        image: await writeFileToDisk(opts.input.formData.image),
        document:
          opts.input.formData.document &&
          (await writeFileToDisk(opts.input.formData.document)),
      };
    }),
});
