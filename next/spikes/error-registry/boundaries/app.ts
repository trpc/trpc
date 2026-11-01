/**
 * The boundaries example: an auth module whose middleware returns its
 * errors, a posts and a billing module whose base procedures declare
 * theirs, and three nested boundaries typed from the router's type alone.
 */
import { createElement } from 'react';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { createErrors, mergeErrors } from '../merge-errors/merge-errors.ts';
import {
  createErrorBoundary,
  errorsOf,
  type FallbackProps,
} from './boundaries.ts';

// auth/errors.ts, posts/errors.ts, billing/errors.ts
export const authErrors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first.' },
  Forbidden: { status: 403 },
});
export const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
export const billingErrors = createErrors({
  CardDeclined: { status: 402 },
});
// For OpenAPI and docs; no client code imports it.
export const backendErrors = mergeErrors(authErrors, postErrors, billingErrors);

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});

const posts = new Map([
  ['1', { id: '1', title: 'Hello' }],
  ['2', { id: '2', title: 'Taken' }],
]);

export const authed = t.procedure.use((opts) => {
  if (opts.ctx.user === null) return authErrors.Unauthorized();
  if (opts.ctx.user === 'guest') return authErrors.Forbidden();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const postProcedure = authed.errors(postErrors);
const billingProcedure = authed.errors(billingErrors);

export const appRouter = t.router({
  posts: {
    byId: postProcedure.input(z.object({ id: z.string() })).query((opts) => {
      if (opts.input.id === 'crash') throw new Error('db is down');
      return (
        posts.get(opts.input.id) ??
        postErrors.PostNotFound({ id: opts.input.id })
      );
    }),
    /** Throws another module's error: undeclared, so a crash. */
    leak: postProcedure.query(() => {
      throw billingErrors.CardDeclined();
    }),
    rename: postProcedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => {
        if ([...posts.values()].some((p) => p.title === opts.input.title)) {
          return postErrors.TitleTaken({ title: opts.input.title });
        }
        const post = { id: opts.input.id, title: opts.input.title };
        posts.set(post.id, post);
        return post;
      }),
  },
  billing: {
    charge: billingProcedure.mutation(() => billingErrors.CardDeclined()),
  },
});

export type AppRouter = typeof appRouter;

const notice =
  (id: string) => (props: FallbackProps<{ readonly _tag: string }>) =>
    createElement(
      'div',
      { id },
      props.error._tag,
      createElement('button', {
        id: `${id}-retry`,
        onClick: props.reset,
        type: 'button',
      }),
    );

// The client half: from here down, nothing but types of the server's.
const errors = errorsOf<AppRouter>();

/** Owns tRPC's failures no boundary names: a crash, a timeout, a proxy's 502. */
export const [RootBoundary, useRootBoundary] = createErrorBoundary({
  name: 'Root',
  errors,
  claims: [],
  unexpected: true,
  fallback: notice('crashed'),
});

export const [OfflineBoundary, useOfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: notice('offline'),
});

/** The auth middleware's errors, which every authed call can fail with. */
export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors,
  parent: OfflineBoundary,
  claims: ['Unauthorized', 'Forbidden'],
  fallback: notice('sign-in'),
});
