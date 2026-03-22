import { initTRPC } from '@trpc/server';
import { transformer } from '../shared/transformer.js';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create({
  transformer,
  errorFormatter(opts) {
    // Declared Errors (when registered) will not pass through this formatter
    // All other error types pass through, including
    // Unregistered Declared Errors which arrive as INTERNAL_SERVER_ERROR

    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        requestId: 'demo_request' as const,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;
