/**
 * A React Server Components server, run with `node --conditions react-server`:
 * it writes action results to stdout as React Flight, the format of a Server
 * Action's response.
 */
import { createRequire } from 'node:module';
import { experimental_createAction } from '@trpc12/trpc/actions';
import { safe } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const flightServer = createRequire(import.meta.url)(
  'react-server-dom-turbopack/server',
) as {
  renderToPipeableStream: (
    model: unknown,
    turbopackMap: object,
  ) => { pipe: (to: NodeJS.WritableStream) => void };
};

const t = initTrpc<{ ctx: { user: string | null } }>();
const sign = t.procedure
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .input(z.object({ message: z.string().min(1), at: z.coerce.date() }))
  .mutation((opts) =>
    opts.input.message === 'missing'
      ? opts.errors.NOT_FOUND({ data: { id: 'p1' } })
      : { ...opts.input, by: opts.ctx.user },
  );
const boom = t.procedure.mutation((): string => {
  throw new Error('db password is hunter2');
});

const action = experimental_createAction(t, {
  ctx: { user: 'ada' },
  exposeUnexpectedErrors: false,
});
const signAction = action(sign);
const form = new FormData();
form.set('message', 'Hello');
form.set('at', '2026-10-18T00:00:00.000Z');

flightServer
  .renderToPipeableStream(
    {
      signed: await signAction(form),
      missing: await signAction({ message: 'missing', at: new Date(0) }),
      invalid: await signAction({ message: '', at: new Date(0) }),
      masked: await action(boom)(),
      dual: await safe(Promise.resolve(1)),
    },
    {},
  )
  .pipe(process.stdout);
