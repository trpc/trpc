/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import {
  MiddlewareBuilder,
  MiddlewareFunction,
  ProcedureParams,
} from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import busboy from 'busboy';
import { NextApiRequest, NextApiResponse } from 'next';
import { File } from 'undici';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { middleware, publicProcedure, router } from '~/server/trpc';

// @ts-expect-error - globalThis.File is not defined for some reason
globalThis.File = File;

export function createFormDataMiddleware<
  TParams extends {
    _ctx_out: {
      req: NextApiRequest;
    };
  } & ProcedureParams,
>(
  builder: (fn: MiddlewareFunction<TParams, any>) => any,
): MiddlewareBuilder<TParams, TParams> {
  return builder(async ({ ctx, next }) => {
    const formData = await getFormData(ctx.req);
    return next({ rawInput: formData } as any);
  });
}

const multipartFormDataParser = createFormDataMiddleware(middleware);

export async function getFormData(req: NextApiRequest) {
  const bb = busboy({ headers: req.headers });
  const form = new FormData();

  await new Promise((resolve, reject) => {
    bb.on('file', async (name, file, info) => {
      const { filename, mimeType } = info;

      const chunks = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      form.append(
        name,
        new File([buffer], filename, { type: mimeType }) as Blob,
      );
    });

    bb.on('field', (name, value) => {
      form.append(name, value);
    });

    bb.on('error', reject);
    bb.on('close', resolve);

    req.pipe(bb);
  });

  return form;
}

const appRouter = router({
  greeting: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(
      z.object({
        name: z.string().nullish(),
      }),
    )
    .query(({ input }) => {
      // This is what you're returning to your client
      return {
        text: `hello ${input?.name ?? 'world'}`,
        // 💡 Tip: Try adding a new property here and see it propagate to the client straight-away
      };
    }),
  // 💡 Tip: Try adding a new procedure here and see if you can use it in the client!
  // getUser: publicProcedure.query(() => {
  //   return { id: '1', name: 'bob' };
  // }),
  mut: publicProcedure
    .use(multipartFormDataParser)
    .input(
      zfd.formData({
        hello: zfd.text().optional(),
        file1: zfd.file(),
        file2: zfd.file(),
      }),
    )
    .mutation((opts) => {
      console.log('input', opts.input);

      return opts.input;
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
