/**
 * In-process tests: `createRouterClient` and `call()` skip HTTP and the
 * serializer, `localLink` keeps the serializer and the client's links.
 */
import {
  createTrpcClient,
  localLink,
  loggerLink,
  routerType,
  safe,
  type LoggerEvent,
} from '@trpc12/trpc/client';
import { call, createRouterClient } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { appRouter } from './router.ts';
import { projectsRouter } from './routers/projects.ts';
import { appLayer, SaasDb } from './store.ts';
import type { RequestContext } from './trpc.ts';

function signedIn(email: string, tenant = 'acme') {
  const db = SaasDb.seeded();
  const session = db.login(email)!;
  const ctx: RequestContext = {
    sessionToken: session.token,
    tenantSlug: tenant,
  };
  return { db, ctx, layer: appLayer(db) };
}

test('createRouterClient: ctx and layer passed in, values by reference', async () => {
  const app = signedIn('ada@acme.test');
  const caller = createRouterClient(appRouter, app);

  const project = await caller.project.create.mutate({ name: '  Billing  ' });
  expect(project.name).toBe('Billing');
  // `.output()` ran: the date left the resolver as an ISO string.
  expect(project.createdAt).toBe(
    app.db.projects.get(project.id)!.createdAt.toISOString(),
  );

  const task = await caller.task.add.mutate({
    projectId: project.id,
    title: 'Invoice',
  });
  expect(await caller.project.stats.query({ projectId: project.id })).toEqual({
    tasks: 1,
    done: 0,
  });
  await caller.task.complete.mutate({ taskId: task.id });
  expect(await caller.project.stats.query({ projectId: project.id })).toEqual({
    tasks: 1,
    done: 1,
  });
});

test('tenancy runs withSession once, though audit starts with it too', async () => {
  const app = signedIn('ada@acme.test');
  const caller = createRouterClient(appRouter, app);
  await caller.project.create.mutate({ name: 'Once' });
  expect(app.db.sessionLookups).toBe(1);
  expect(app.db.audit).toEqual([
    expect.objectContaining({ path: 'project.create', ok: true }),
  ]);
});

test('roles, memberships and plan limits are typed errors', async () => {
  const viewer = createRouterClient(appRouter, signedIn('cy@acme.test'));
  const [, role] = await safe(viewer.project.create.mutate({ name: 'Nope' }));
  expect(role?.code === 'INSUFFICIENT_ROLE' && role.data).toEqual({
    required: 'member',
    actual: 'viewer',
  });

  const outsider = createRouterClient(
    appRouter,
    signedIn('bob@acme.test', 'globex'),
  );
  const [, forbidden] = await safe(outsider.project.list.query());
  expect(forbidden?.code === 'FORBIDDEN' && forbidden.data).toEqual({
    tenant: 'globex',
  });

  const free = createRouterClient(
    appRouter,
    signedIn('ada@acme.test', 'globex'),
  );
  const [, quota] = await safe(free.project.create.mutate({ name: 'Second' }));
  expect(quota?.code === 'QUOTA_EXCEEDED' && quota.data).toEqual({
    plan: 'free',
    limit: 1,
  });

  const anonymous = createRouterClient(appRouter, {
    ctx: { sessionToken: null, tenantSlug: 'acme' },
    layer: appLayer(SaasDb.seeded()),
  });
  expect(await anonymous.health.query()).toBe('ok');
  const [, unauthorized] = await safe(anonymous.auth.me.query());
  expect(unauthorized?.code).toBe('UNAUTHORIZED');
});

test('call(): one procedure, its errors thrown', async () => {
  const app = signedIn('bob@acme.test');
  const byId = projectsRouter.project.byId;
  const byIdCall = (projectId: string) =>
    call(byId, { projectId }, { ctx: app.ctx, layer: app.layer });

  const project = [...app.db.projects.values()][0]!;
  expect((await byIdCall(project.id)).name).toBe('Website');
  await expect(byIdCall('prj_404')).rejects.toMatchObject({
    code: 'NOT_FOUND',
    data: { projectId: 'prj_404' },
  });
});

test('localLink: through the serializer and the links before it', async () => {
  const app = signedIn('ada@acme.test');
  const log: LoggerEvent[] = [];
  const client = createTrpcClient({
    router: routerType<typeof appRouter>(),
    links: [
      loggerLink({ log: (event) => log.push(event) }),
      localLink({
        router: appRouter,
        layer: app.layer,
        createContext: () => app.ctx,
      }),
    ],
  });

  const members = await client.admin.members.query();
  expect(members).toContainEqual({ user: 'Cy', role: 'viewer' });
  expect(log.map((event) => `${event.direction} ${event.op.path}`)).toEqual([
    'up admin.members',
    'down admin.members',
  ]);

  // The CSV export is an HTTP response, which in-process calls can't carry.
  const projectId = (await client.project.list.query())[0]!.id;
  const [, raw] = await safe(client.project.exportCsv.query({ projectId }));
  expect(raw?.code).toBe('BAD_REQUEST');
});
