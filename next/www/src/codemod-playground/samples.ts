/** v11 code the playground starts from, one sample per tab. */
export interface CodemodSample {
  readonly id: string;
  readonly label: string;
  readonly filename: string;
  readonly code: string;
}

export const codemodSamples: ReadonlyArray<CodemodSample> = [
  {
    id: 'server',
    label: 'Server',
    filename: 'server/trpc.ts',
    code: `import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

export const appRouter = t.router({
  greet: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => \`hello \${input.name}\`),
});

export const caller = appRouter.createCaller({ user: null });
`,
  },
  {
    id: 'client',
    label: 'Client',
    filename: 'client.ts',
    code: `import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server/router';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});

const greeting = await client.greet.query({ name: 'world' });
`,
  },
  {
    id: 'react',
    label: 'React',
    filename: 'utils/trpc.tsx',
    code: `import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useQuery } from '@tanstack/react-query';
import type { AppRouter } from '../server/router';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function Greeting() {
  const trpc = useTRPC();
  const greeting = useQuery(trpc.greet.queryOptions({ name: 'world' }));
  return <p>{greeting.data}</p>;
}
`,
  },
  {
    id: 'adapter',
    label: 'Adapter',
    filename: 'server/index.ts',
    code: `import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { observable } from '@trpc/server/observable';

const t = initTRPC.create();

export const appRouter = t.router({
  ticks: t.procedure.subscription(() =>
    observable<number>((emit) => {
      const timer = setInterval(() => emit.next(Date.now()), 1000);
      return () => clearInterval(timer);
    }),
  ),
});

export default {
  fetch: (req: Request) =>
    fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter }),
};
`,
  },
];
