/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { TRPCError } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import formidable, { VolatileFile, errors } from 'formidable';
import { NextApiRequest, NextApiResponse } from 'next';
import stream from 'stream';
import { z } from 'zod';
import { publicProcedure, router } from '~/server/trpc';

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
    .input(
      z.object({
        hello: z.string(),
        file1: z.custom<typeof VolatileFile>(),
      }),
    )
    .mutation((opts) => {
      console.log(opts.input);

      return opts.input;
    }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

const trpcHandler = trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: (opts) => {
    console.log('hello');
    console.log(opts.req.body);
    return opts;
  },
});
// export API handler
export default async (req: NextApiRequest, res: NextApiResponse) => {
  // await trpcHandler(req, res);
  const form = formidable({
    allowEmptyFiles: true,
    fileWriteStreamHandler(...args) {
      const [file] = args as unknown as [typeof VolatileFile];
      console.log('stream created');
      return new stream.Duplex();
    },
  });

  console.log('parsing');
  const [err, fields, files] = await new Promise<
    [null, formidable.Fields, files] | [unknown, null]
  >((resolve, reject) => {
    console.log('papapapa');
    form.parse(req, (err, fields, files) => {
      console.log('callback');
      err ? reject([err, null]) : resolve([null, fields, files]);
    });
  });
  console.log('parsed', { err, fields, files });
  if (fields) {
    // yay
    console.log({ fields }, req.body);
    res.send('waaa');
    return;
  }
  res.status(500).json({
    TODO: 'handle error',
    message: err instanceof Error ? err.message : undefined,
  });
};

export const config = {
  api: {
    bodyParser: false,
  },
};
