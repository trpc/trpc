/**
 * The boundaries example: a root registry every call fails with, a posts
 * and a billing module in their own scopes, and three nested boundaries.
 */
import { createElement } from 'react';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import {
  createErrors,
  mergeErrors,
  scope,
  withErrors,
} from '../merge-errors/merge-errors.ts';
import { createErrorBoundary, type FallbackProps } from './boundaries.ts';

export const rootErrors = createErrors({
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
export const errors = mergeErrors(rootErrors, postErrors, billingErrors);

const t = initTrpc<{ ctx: { user: string | null } }>({
  warnThrownErrors: false,
});

const posts = new Map([
  ['1', { id: '1', title: 'Hello' }],
  ['2', { id: '2', title: 'Taken' }],
]);

const authed = t.procedure.use((opts) => {
  if (opts.ctx.user === null) throw new rootErrors.Unauthorized();
  if (opts.ctx.user === 'guest') throw new rootErrors.Forbidden();
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = withErrors(rootErrors, {
  posts: scope(postErrors, {
    byId: authed.input(z.object({ id: z.string() })).query((opts) => {
      if (opts.input.id === 'crash') throw new Error('db is down');
      const post = posts.get(opts.input.id);
      if (!post) throw new postErrors.PostNotFound({ id: opts.input.id });
      return post;
    }),
    /** Throws another module's error, outside its scope. */
    leak: authed.query(() => {
      throw new billingErrors.CardDeclined();
    }),
    rename: authed
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => {
        if ([...posts.values()].some((p) => p.title === opts.input.title)) {
          throw new postErrors.TitleTaken({ title: opts.input.title });
        }
        const post = { id: opts.input.id, title: opts.input.title };
        posts.set(post.id, post);
        return post;
      }),
  }),
  billing: scope(billingErrors, {
    charge: authed.mutation(() => {
      throw new billingErrors.CardDeclined();
    }),
  }),
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

/** Owns tRPC's failures no boundary names: a crash, a timeout, an unknown tag. */
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

/** The root registry's errors, which every call can fail with. */
export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors,
  parent: OfflineBoundary,
  claims: ['Unauthorized', 'Forbidden'],
  fallback: notice('sign-in'),
});
