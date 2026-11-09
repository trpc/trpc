import {
  type AnyContractRouter,
  experimental_contract,
} from '@trpc12/trpc/contract';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { z } from 'zod';

const c = experimental_contract.create().concat(experimental_openapi());

export const Post = z.object({ id: z.string(), title: z.string() });
export type Post = z.infer<typeof Post>;

// No decorators here, so a client imports the contract without Nest.
export const appContract = {
  health: c
    .meta({ route: { path: '/health' } })
    .output(z.literal('ok'))
    .query(),
  post: {
    list: c
      .meta({ route: { method: 'GET', path: '/posts' } })
      .output(z.array(Post))
      .query(),
    byId: c
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .output(Post)
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(),
    create: c
      .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
      .input(z.object({ title: z.string().min(1) }))
      .output(Post)
      .errors({ UNAUTHORIZED: {} })
      .mutation(),
  },
  admin: {
    stats: c
      .meta({ route: { path: '/admin/stats' } })
      .output(z.object({ posts: z.number(), requests: z.number() }))
      .query(),
  },
} satisfies AnyContractRouter;
