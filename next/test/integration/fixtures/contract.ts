import { contract } from '@trpc12/trpc/contract';
import { z } from 'zod';
import { openapi } from '@trpc12/trpc/openapi';

const c = contract.create<{ meta: { auth?: boolean } }>().concat(openapi());

export const Post = z.object({ id: z.string(), title: z.string() });

export const postContract = {
  byId: c
    .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
    .input(z.object({ id: z.string() }))
    .output(Post)
    .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
    .query(),
  create: c
    .meta({ auth: true })
    .input(z.object({ title: z.string().min(1) }))
    .output(Post)
    .errors({ UNAUTHORIZED: {} })
    .mutation(),
  onAdd: c.output(Post).subscription({ tracked: true }),
};

export const appContract = {
  health: c.output(z.literal('ok')).query(),
  post: postContract,
};
export type AppContract = typeof appContract;
