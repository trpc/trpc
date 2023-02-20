/**
 * @jest-environment node
 */
import { createTRPCProxyClient, splitLink } from '@trpc/client';
import { unstable_formDataLink } from '@trpc/client/links/formDataLink';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { TRPCError, initTRPC } from '@trpc/server';
import { nodeHTTPFormDataContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { konn } from 'konn';
import { zfd } from 'zod-form-data';

const t = konn()
  .beforeAll(() => {
    const t = initTRPC.create();

    const users: { name: string; age: number }[] = [];
    const router = t.router({
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

          return input;
        }),
    });

    const { listen, server } = createHTTPServer({
      router,
      unstable_contentTypeHandlers: [
        nodeHTTPFormDataContentTypeHandler(),
        nodeHTTPJSONContentTypeHandler(),
      ],
    });

    const { port } = listen(0);
    const url = `http://localhost:${port}`;

    const client = createTRPCProxyClient<typeof router>({
      links: [
        splitLink({
          condition: (op) => op.input instanceof FormData,
          true: unstable_formDataLink({
            url,
            fetch: fetch as any,
          }),
          false: httpBatchLink({
            url,
            fetch: fetch as any,
          }),
        }),
      ],
    });

    return { server, port, router, client };
  })
  .afterAll(async (ctx) => {
    await new Promise<void>((resolve, reject) => {
      ctx.server?.close((err) => {
        err ? reject(err) : resolve();
      });
    });
  })
  .done();

test('form data', async () => {
  const form = new FormData();
  form.append('name', 'bob');
  form.append('age', '42');

  const bobUser = {
    name: 'bob',
    age: 42,
  };

  const user = await t.client.createUser.mutate(form as any);
  expect(user).toStrictEqual(bobUser);

  const foundUserForm = new FormData();
  foundUserForm.append('name', 'bob');

  const foundUser = await t.client.getUser.query(foundUserForm as any);
  expect(foundUser).toStrictEqual(bobUser);
});
