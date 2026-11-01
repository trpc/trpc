/**
 * In-process tests: `createRouterClient` and `t.call()` skip HTTP and the
 * transformer, `localLink` keeps the transformer and the client's links. Each
 * test owns its runtime, so `await using` releases its services.
 */
import {
  createTrpcClient,
  localLink,
  loggerLink,
  routerType,
  safe,
  type LoggerEvent,
} from '@trpc12/trpc/client';
import { createRouterClient } from '@trpc12/trpc/server';
import { ManagedRuntime } from 'effect';
import { expect, test } from 'vite-plus/test';
import { appRouter } from './router.ts';
import { projectsRouter } from './routers/projects.ts';
import { appLayer, SaasDb } from './store.ts';
import { t, type RequestContext } from './trpc.ts';

function signedIn(email: string, tenant = 'acme') {
  const db = SaasDb.seeded();
  const session = db.login(email)!;
  const ctx: RequestContext = {
    sessionToken: session.token,
    tenantSlug: tenant,
  };
  const runtime = ManagedRuntime.make(appLayer(db));
  return { db, ctx, runtime, [Symbol.asyncDispose]: () => runtime.dispose() };
}

test('createRouterClient: ctx and runtime passed in, values by reference', async () => {
  await using app = signedIn('ada@acme.test');
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
  await using app = signedIn('ada@acme.test');
  const caller = createRouterClient(appRouter, app);
  await caller.project.create.mutate({ name: 'Once' });
  expect(app.db.sessionLookups).toBe(1);
  expect(app.db.audit).toEqual([
    expect.objectContaining({ path: 'project.create', ok: true }),
  ]);
});

test('roles, memberships and plan limits are typed errors', async () => {
  await using cy = signedIn('cy@acme.test');
  const viewer = createRouterClient(appRouter, cy);
  const [, role] = await safe(viewer.project.create.mutate({ name: 'Nope' }));
  expect(role?.code === 'INSUFFICIENT_ROLE' && role.data).toEqual({
    required: 'member',
    actual: 'viewer',
  });

  await using bob = signedIn('bob@acme.test', 'globex');
  const outsider = createRouterClient(appRouter, bob);
  const [, forbidden] = await safe(outsider.project.list.query());
  expect(forbidden?.code === 'FORBIDDEN' && forbidden.data).toEqual({
    tenant: 'globex',
  });

  await using ada = signedIn('ada@acme.test', 'globex');
  const free = createRouterClient(appRouter, ada);
  const [, quota] = await safe(free.project.create.mutate({ name: 'Second' }));
  expect(quota?.code === 'QUOTA_EXCEEDED' && quota.data).toEqual({
    plan: 'free',
    limit: 1,
  });

  await using runtime = ManagedRuntime.make(appLayer(SaasDb.seeded()));
  const anonymous = createRouterClient(appRouter, {
    ctx: { sessionToken: null, tenantSlug: 'acme' },
    runtime,
  });
  expect(await anonymous.health.query()).toBe('ok');
  const [, unauthorized] = await safe(anonymous.auth.me.query());
  expect(unauthorized?.code).toBe('UNAUTHORIZED');
});

test('t.call(): one procedure, its errors thrown, its layer built per call', async () => {
  await using app = signedIn('bob@acme.test');
  const byId = projectsRouter.project.byId;
  const byIdCall = (projectId: string) =>
    t.call(byId, { projectId }, { ctx: app.ctx, layer: appLayer(app.db) });

  const project = [...app.db.projects.values()][0]!;
  expect((await byIdCall(project.id)).name).toBe('Website');
  await expect(byIdCall('prj_404')).rejects.toMatchObject({
    code: 'NOT_FOUND',
    data: { projectId: 'prj_404' },
  });
});

test('localLink: through the transformer and the links before it', async () => {
  await using app = signedIn('ada@acme.test');
  const log: LoggerEvent[] = [];
  const client = createTrpcClient({
    router: routerType<typeof appRouter>(),
    links: [
      loggerLink({ log: (event) => log.push(event) }),
      localLink({
        router: appRouter,
        runtime: app.runtime,
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

  // The CSV export is its own HTTP response; in-process it's a web Response.
  const projectId = (await client.project.list.query())[0]!.id;
  const csv = await client.project.exportCsv.query({ projectId });
  expect(csv.headers.get('content-type')).toBe('text/csv');
  expect((await csv.text()).split('\n')[0]).toBe('id,title,done');
});
