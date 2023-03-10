/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import {
  FormDataFileStream,
  nodeHTTPFormDataContentTypeHandler,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import fs from 'fs';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { publicProcedure, router } from '~/server/trpc';
import { uploadFileSchema } from '~/utils/schemas';

async function writeFileToDisk(file: FormDataFileStream) {
  const rootDir = __dirname + '/../../../../..';
  const nonce = Math.random().toString(36).substring(2, 15);
  const fileDir = path.resolve(`${rootDir}/public/uploads/${nonce}`);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  const fd = fs.createWriteStream(path.resolve(`${fileDir}/${file.name}`));
  for await (const chunk of file.stream) {
    fd.write(chunk);
  }
  fd.end();
  return {
    url: `/uploads/${nonce}/${file.name}`,
    name: file.name,
  };
}

const appRouter = router({
  upload: publicProcedure.input(uploadFileSchema).mutation(async (opts) => {
    return {
      image: await writeFileToDisk(opts.input.image),
      document:
        opts.input.document && (await writeFileToDisk(opts.input.document)),
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
  },
};
