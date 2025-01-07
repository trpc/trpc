import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createChain } from './internals/createChain';
import { trisectLink } from './trisectLink';
import { isNonJsonSerializable, type OperationLink, type TRPCLink } from './types';

test('trisectLink', () => {
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
  const httpLinkFormDataSpy = vi.fn();
  const httpLinkFormData: TRPCLink<any> = () => () =>
    observable(() => {
      httpLinkFormDataSpy();
    });
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    trisectLink({
      condition(op) {
        if (op.type === "subscription") {
          return 0;
        }

        if (isNonJsonSerializable(op.input)) {
          return 1;
        }

        return 2;
      },
      0: wsLink,
      1: [httpLinkFormData],
      2: [httpLink]
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
  expect(httpLinkFormDataSpy).toHaveBeenCalledTimes(0);
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
  expect(httpLinkFormDataSpy).toHaveBeenCalledTimes(0);
  expect(httpLinkSpy).toHaveBeenCalledTimes(0);
  expect(wsLinkSpy).toHaveBeenCalledTimes(1);
  vi.resetAllMocks();

  createChain({
    links,
    op: {
      type: 'query',
      input: new FormData(),
      path: '.',
      id: 0,
      context: {},
      signal: null,
    },
  }).subscribe({});
  expect(httpLinkFormDataSpy).toHaveBeenCalledTimes(1);
  expect(httpLinkSpy).toHaveBeenCalledTimes(0);
  expect(wsLinkSpy).toHaveBeenCalledTimes(0);
});

