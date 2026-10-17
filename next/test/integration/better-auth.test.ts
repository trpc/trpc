import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createTestServer } from '../../packages/trpc/src/fixtures/server.ts';

const auth = betterAuth({
  baseURL: 'http://localhost:3000',
  secret: 'a-test-secret-that-is-long-enough-to-use',
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  emailAndPassword: { enabled: true },
  logger: { disabled: true },
});

const t = initTrpc<{ ctx: { headers: Headers } }>();

const authed = t.procedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: ctx.headers });
  return session
    ? next({ ctx: { user: session.user, session: session.session } })
    : error({ code: 'UNAUTHORIZED' });
});

const router = {
  me: authed.query(({ ctx }) => ({
    name: ctx.user.name,
    email: ctx.user.email,
  })),
};

test('a Better Auth session becomes the ctx user through a middleware', async () => {
  await using server = await createTestServer({
    router,
    createContext: ({ request }) => ({
      headers: new Headers(request.headers as Record<string, string>),
    }),
  });
  const signUp = await auth.api.signUpEmail({
    body: { email: 'ada@example.com', password: 'correct horse', name: 'Ada' },
    asResponse: true,
  });
  const cookie = signUp.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

  const client = (headers: Record<string, string>) =>
    createTrpcClient({
      router: routerType<typeof router>(),
      links: [httpLink({ url: server.url, headers })],
    });
  const me = await client({ cookie }).me.query();
  expect(me).toEqual({ name: 'Ada', email: 'ada@example.com' });
  expectTypeOf(me.name).toEqualTypeOf<string>();

  const anonymous = await safe(client({}).me.query());
  expect(anonymous.error).toMatchObject({ code: 'UNAUTHORIZED' });
});
