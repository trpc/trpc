import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import {
  createTrpcClient,
  httpStreamLink,
  routerType,
} from '@trpc12/trpc/client';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { Schema } from 'effect';
import { createElement } from 'react';
import { closedLink } from '../closed-errors/closed.ts';
import { createShell } from './shells.ts';

const t = initTrpc<{ ctx: { user: string | undefined } }>();

const requireViewer = t.procedure.use((opts) =>
  opts.ctx.user === undefined
    ? error({ code: 'UNAUTHORIZED' })
    : opts.next({ ctx: { user: opts.ctx.user } }),
);

export const router = {
  doc: {
    byId: requireViewer
      .input(Schema.Struct({ id: Schema.String }))
      .query((opts) => docs.get(opts.input.id) ?? error({ code: 'NOT_FOUND' })),
    rename: requireViewer
      .input(Schema.Struct({ id: Schema.String, title: Schema.String }))
      .mutation((opts) => {
        if (opts.input.title === 'crash') throw new Error('db is down');
        if ([...docs.values()].some((d) => d.title === opts.input.title)) {
          return error({ code: 'TITLE_TAKEN' });
        }
        const doc = { id: opts.input.id, title: opts.input.title };
        docs.set(doc.id, doc);
        return doc;
      }),
  },
};

const docs = new Map<string, { id: string; title: string }>();

/** The server, a client with `closedLink`, and switches for the session and the network. */
export function createApp() {
  docs.clear();
  docs.set('1', { id: '1', title: 'Hello' });
  docs.set('2', { id: '2', title: 'Taken' });
  const state = { user: 'ada' as string | undefined, online: true };
  const handler = createFetchHandler({
    router,
    createContext: () => ({ user: state.user }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      closedLink(),
      httpStreamLink({
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

const notice = (id: string, text: string, reset?: () => void) =>
  createElement(
    'div',
    { id },
    text,
    reset
      ? createElement('button', { id: `${id}-retry`, onClick: reset })
      : null,
  );

/** Owns every `defined: false` error: thrown, masked, or from the boundary. */
export const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: (props) => notice('crashed', 'Something went wrong', props.reset),
});

export const OfflineShell = RootShell.extend({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: (props) => notice('offline', 'You are offline', props.reset),
});

export const AuthShell = OfflineShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: (props) => notice('sign-in', 'Sign in', props.reset),
});
