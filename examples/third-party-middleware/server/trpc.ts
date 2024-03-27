import { initTRPC } from '@trpc/server';
import {
  applySimpleAcmeAuthMiddleware,
  createAcmeAuthMiddleware,
} from './middlewares/AcmeAuth';

const t = initTRPC.context<{ authToken: string | undefined }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

//
// Apply the simple auth middleware, this is fine if it's
// intended to be attached to a single procedure or has no global config, but
// might limit how your users can structure their apps,
// for instance if they composed a lot of middlewares case-by-case

export const simpleAuthProcedure = t.procedure.use((opts) =>
  applySimpleAcmeAuthMiddleware(
    opts.next,
    { token: opts.ctx.authToken },
    { authServer: 'path/to/auth/server.html' },
  ),
);

//
// Create an auth middleware with the factorry method,
// this allows the config to be passed once and
// re-used around the application easily

export const { applyAcmeAuthMiddleware } = createAcmeAuthMiddleware({
  authServer: 'path/to/auth/server.html',
});

export const authProcedure = t.procedure.use((opts) =>
  applyAcmeAuthMiddleware(opts.next, { token: opts.ctx.authToken }),
);
