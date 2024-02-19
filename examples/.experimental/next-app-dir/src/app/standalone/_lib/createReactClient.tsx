/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
  CreateTRPCClient,
  CreateTRPCClientOptions,
  TRPCLinkDecoration,
} from '@trpc/client';
import { createTRPCClient, getUntypedClient } from '@trpc/client';
import type {
  AnyTRPCRouter,
  ProcedureType,
  TRPCProcedureType,
} from '@trpc/server';
import { observableToPromise } from '@trpc/server/observable';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import React, { use, useRef } from 'react';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function getUrl() {
  return getBaseUrl() + '/api/trpc';
}

const normalize = (opts: {
  path: string[];
  input: unknown;
  type: ProcedureType;
}) => {
  return JSON.stringify(opts);
};
export function createReactClient<
  TRouter extends AnyTRPCRouter,
  TDecoration extends Partial<TRPCLinkDecoration>,
>(getOptions: () => CreateTRPCClientOptions<TRouter, TDecoration>) {
  type Context = {
    client: CreateTRPCClient<TRouter>;
  };
  const Provider = React.createContext(null as unknown as Context);
  return {
    Provider: (props: { children: React.ReactNode }) => {
      const [client] = React.useState(() => {
        const options = getOptions();
        return createTRPCClient(options);
      });

      return (
        <Provider.Provider value={{ client }}>
          {props.children}
        </Provider.Provider>
      );
    },
    useClient: () => {
      const ctx = use(Provider);
      const ref = useRef();
      // force rendered
      const [renderCount, setRenderCount] = React.useState(0);
      const forceRender = React.useCallback(() => {
        setRenderCount((c) => c + 1);
      }, []);

      const map = useRef(new Map<any, any>());
      if (!ctx) {
        throw new Error('No tRPC client found');
      }
      const untyped = getUntypedClient(ctx.client);

      return createRecursiveProxy((opts) => {
        console.log('opts', opts);
        const path = [...opts.path];
        const type = path.pop()! as TRPCProcedureType;

        const input = opts.args[0];

        const normalized = normalize({ path, input, type });

        if (!map.current.has(normalized)) {
          map.current.set(
            normalized,
            observableToPromise(
              untyped.$request({
                type,
                input,
                path: path.join('.'),
              }),
            ).promise,
          );
        }

        return map.current.get(normalized);
      }) as any;
    },
  };
}
