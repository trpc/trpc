import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { Schema } from 'effect';
import { createElement } from 'react';
import {
  createErrorBoundary,
  type ErrorBoundaryFallbackProps,
} from '../error-boundary.ts';

const t = initTrpc<{ ctx: { user: string | undefined } }>();

const requireViewer = t.procedure.use((opts) =>
  opts.ctx.user === undefined
    ? error({ code: 'UNAUTHORIZED' })
    : opts.next({ ctx: { user: opts.ctx.user } }),
);

interface Doc {
  id: string;
  title: string;
}

const docs = new Map<string, Doc>();

export const router = t.router({
  doc: {
    byId: requireViewer
      .input(Schema.Struct({ id: Schema.String }))
      .query((opts) => docs.get(opts.input.id) ?? error({ code: 'NOT_FOUND' })),
    /** One title a page, from `cursor`. */
    titles: requireViewer
      .input(Schema.Struct({ cursor: Schema.Number }))
      .query((opts) => {
        const all = [...docs.values()];
        const page: { title: string | undefined; next: number | null } = {
          title: all[opts.input.cursor]?.title,
          next:
            opts.input.cursor + 1 < all.length ? opts.input.cursor + 1 : null,
        };
        return page;
      }),
    rename: requireViewer
      .input(Schema.Struct({ id: Schema.String, title: Schema.String }))
      .mutation((opts) => {
        if (opts.input.title === 'crash') throw new Error('db is down');
        if ([...docs.values()].some((d) => d.title === opts.input.title)) {
          return error({ code: 'TITLE_TAKEN' });
        }
        const doc: Doc = { id: opts.input.id, title: opts.input.title };
        docs.set(doc.id, doc);
        return doc;
      }),
  },
});

/** The server, a client over HTTP, and switches for the session and the network. */
export function createApp() {
  docs.clear();
  docs.set('1', { id: '1', title: 'Hello' });
  docs.set('2', { id: '2', title: 'Taken' });
  const state: { user: string | undefined; online: boolean } = {
    user: 'ada',
    online: true,
  };
  const handler = createFetchHandler({
    router,
    createContext: () => ({ user: state.user }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: async (input, init) => {
          if (!state.online) throw new TypeError('fetch failed');
          return handler.fetch(new Request(input, init));
        },
      }),
    ],
  });
  return {
    state,
    trpc: createTrpcQueryUtils({ client }),
    [Symbol.asyncDispose]: () => handler.dispose(),
  };
}

const notice =
  (id: string, text: string) => (props: ErrorBoundaryFallbackProps) =>
    createElement(
      'div',
      { id },
      text,
      createElement('button', {
        id: `${id}-retry`,
        onClick: props.reset,
        type: 'button',
      }),
    );

/** Owns every `defined: false` error: thrown, masked, or from the link. */
export const [RootBoundary, useRootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: notice('crashed', 'Something went wrong'),
});

export const [OfflineBoundary, useOfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  parent: RootBoundary,
  claims: ['NETWORK_ERROR'],
  fallback: notice('offline', 'You are offline'),
});

export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  parent: OfflineBoundary,
  claims: ['UNAUTHORIZED'],
  fallback: notice('sign-in', 'Sign in'),
});
