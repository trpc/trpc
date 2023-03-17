/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import {
  nodeHTTPFormDataContentTypeHandler,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import * as undici from 'undici';
import { z } from 'zod';
import { publicProcedure, router } from '~/server/trpc';
import { uploadFileSchema } from '~/utils/schemas';

globalThis.File = undici.File as any;

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

const appRouter = router({
  upload: publicProcedure
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

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

const handler = trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: (opts) => {
    return opts;
  },
  unstable_contentTypeHandlers: [
    nodeHTTPFormDataContentTypeHandler(),
    nodeHTTPJSONContentTypeHandler(),
  ],
});

// export API handler
export default async (req: NextApiRequest, res: NextApiResponse) => {
  await handler(req, res);
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '100mb',
  },
};
