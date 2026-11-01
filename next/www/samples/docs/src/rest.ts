/**
 * The blog of `./server.ts` over REST, documented for clients generated from
 * OpenAPI. `pnpm --filter @samples/docs generate:api` writes its document to
 * `../openapi.json`, and Hey API writes `./api/` from that.
 */
import {
  experimental_generateOpenApi,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

import { db, PostSchema, type Context } from './server.ts';

const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());

const authed = t.procedure
  .use((opts) =>
    opts.ctx.user
      ? opts.next({ ctx: { user: opts.ctx.user } })
      : error({ code: 'UNAUTHORIZED' }),
  )
  .meta({ route: { spec: (op) => ({ ...op, security: [{ bearer: [] }] }) } });

export const restRouter = t.router({
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .input(z.object({ id: z.string() }))
      .output(PostSchema)
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
      ),
    create: authed
      .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
      .input(z.object({ title: z.string().min(1), cover: z.file().optional() }))
      .output(PostSchema)
      .mutation((opts) =>
        db.post.create({ title: opts.input.title, author: opts.ctx.user.name }),
      ),
    onAdd: t.procedure
      .meta({ route: { path: '/posts/events' } })
      .output(PostSchema)
      .subscription(async function* () {
        for (const post of db.post.list()) yield tracked(post.id, post);
      }),
  },
});

export const document = experimental_generateOpenApi(restRouter, {
  info: { title: 'Blog', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  },
});
