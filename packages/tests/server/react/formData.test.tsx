import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { FormData } from '@remix-run/web-form-data/dist/src/form-data';
import { QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import { unstable_formDataLink } from '@trpc/client/links/formDataLink';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { splitLink } from '@trpc/client/links/splitLink';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import { TRPCError, initTRPC } from '@trpc/server';
import { nodeHTTPFormDataContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { konn } from 'konn';
import { ReactNode, useState } from 'react';
import React from 'react';
import fetch from 'undici';
import { zfd } from 'zod-form-data';

globalThis.FormData = FormData as any;

type User = {
  name: string;
  age: number;
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const users: User[] = [];

    const appRouter = t.router({
      getUser: t.procedure
        .input(
          zfd.formData({
            name: zfd.text(),
          }),
        )
        .query(({ input }) => {
          const user = users.find((user) => user.name === input.name);

          if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }

          return user;
        }),
      createUser: t.procedure
        .input(
          zfd.formData({
            name: zfd.text(),
            age: zfd.numeric(),
          }),
        )
        .mutation(({ input }) => {
          users.push(input);
          console.log(input);

          return input;
        }),
    });

    type TRouter = typeof appRouter;

    const opts = routerToServerAndClientNew(appRouter, {
      server: {
        unstable_contentTypeHandlers: [
          nodeHTTPFormDataContentTypeHandler(),
          nodeHTTPJSONContentTypeHandler(),
        ],
      },
      client: ({ httpUrl }) => ({
        links: [
          splitLink({
            condition: (op) => op.input instanceof FormData,
            true: unstable_formDataLink({
              url: httpUrl,
              fetch: fetch as any,
            }),
            false: httpBatchLink({
              url: httpUrl,
              fetch: fetch as any,
            }),
          }),
        ],
      }),
    });

    const queryClient = createQueryClient();
    const proxy = createTRPCReact<TRouter, unknown, 'ExperimentalSuspense'>();
    const baseProxy = proxy as CreateTRPCReactBase<TRouter, unknown>;

    const client = opts.client;

    function App(props: { children: ReactNode }) {
      return (
        <baseProxy.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </baseProxy.Provider>
      );
    }

    return {
      close: opts.close,
      client,
      queryClient,
      proxy,
      App,
      appRouter,
      opts,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('POST form submission', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const [user, setUser] = useState<User>();

    const createUserMutation = proxy.createUser.useMutation({
      onSuccess(data) {
        console.log('user', data);
        setUser(data);
      },
    });

    return (
      <div>
        <form
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);
            createUserMutation.mutate(formData as any);

            e.preventDefault();
          }}
        >
          <input name="name" defaultValue="bob" />
          <input name="age" defaultValue={42} />
          <button type="submit">Submit</button>
        </form>
        {user && (
          <div>
            <p>Name: {user.name}</p>
            <p>Age: {user.age}</p>
          </div>
        )}
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  utils.getByText('Submit').click();
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('bob');
  });
});
