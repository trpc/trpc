import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import { splitLink } from './splitLink';
import type { OperationLink, TRPCLink } from './types';

test('splitLink', () => {
  const wsLinkSpy = vi.fn();
  const wsLink: TRPCLink<any> = () => () =>
    observable(() => {
      wsLinkSpy();
    });
  const httpLinkSpy = vi.fn();
  const httpLink: TRPCLink<any> = () => () =>
    observable(() => {
      httpLinkSpy();
    });
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    splitLink({
      condition(op) {
        return op.type === 'subscription';
      },
      true: wsLink,
      false: [httpLink],
    })(null as any),
  ];

  createChain({
    links,
    op: {
      type: 'query',
      input: null,
      path: '.',
      id: 0,
      context: {},
      signal: null,
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(1);
  expect(wsLinkSpy).toHaveBeenCalledTimes(0);
  vi.resetAllMocks();

  createChain({
    links,
    op: {
      type: 'subscription',
      input: null,
      path: '.',
      id: 0,
      context: {},
      signal: null,
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(0);
  expect(wsLinkSpy).toHaveBeenCalledTimes(1);
});
