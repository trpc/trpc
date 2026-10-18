/**
 * Starts the API on Effect's server, Express and Fastify, and runs the same
 * scenario against each, failing on any unexpected result. Run with
 * `pnpm smoke` (or `pnpm example` from `next/`).
 */
import assert from 'node:assert/strict';
import {
  createSafeClient,
  matchError,
  safe,
  type LoggerEvent,
} from '@trpc12/trpc/client';
import { createApiClient } from './src/client.ts';
import { appOrigin, createApiHandler } from './src/handler.ts';
import {
  listenEffect,
  listenExpress,
  listenFastify,
  type Listening,
} from './src/servers.ts';

async function scenario(server: Listening) {
  const origin = server.origin;

  // Plain HTTP beside tRPC: health and a CORS preflight.
  const health = await fetch(`${origin}/health`);
  assert.equal(await health.text(), 'ok');
  const preflight = await fetch(`${origin}/trpc/project.list`, {
    method: 'OPTIONS',
    headers: { origin: appOrigin, 'access-control-request-method': 'GET' },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), appOrigin);
  assert.equal(
    preflight.headers.get('access-control-allow-credentials'),
    'true',
  );

  // No session: UNAUTHORIZED, from the tenancy extension.
  const anonymous = createApiClient({ origin, tenant: 'acme' });
  assert.equal(await anonymous.health.query(), 'ok');
  const [, noSession] = await safe(anonymous.project.list.query());
  assert.equal(noSession?.code, 'UNAUTHORIZED');

  // Log in: a 201 with a session cookie, read through `onResponse`.
  const loginResponse: { status?: number; cookie?: string | null } = {};
  const session = await anonymous.auth.login.mutate(
    { email: 'ada@acme.test' },
    {
      onResponse: (res) => {
        loginResponse.status = res.status;
        loginResponse.cookie = res.headers.get('set-cookie');
      },
    },
  );
  assert.deepEqual(session.tenants, ['acme', 'globex']);
  assert.equal(loginResponse.status, 201);
  assert.match(loginResponse.cookie ?? '', /^sid=[\w-]+;.* HttpOnly/);

  // The cookie works as well as the bearer token.
  const viaCookie = await fetch(`${origin}/trpc/auth.me`, {
    headers: {
      cookie: loginResponse.cookie!.split(';')[0]!,
      'x-tenant': 'acme',
    },
  });
  assert.equal(viaCookie.status, 200);

  const log: LoggerEvent[] = [];
  const ada = createApiClient({
    origin,
    token: session.token,
    tenant: 'acme',
    log: (event) => log.push(event),
  });
  assert.deepEqual(await ada.auth.me.query(), { name: 'Ada', role: 'admin' });

  // Response headers from the `Response` service; `.output()` turned dates
  // into strings. Unbatched: a batch streams its lines and is `no-cache`.
  let cacheControl: string | null = null;
  const projects = await ada.project.list.query(undefined, {
    batch: false,
    onResponse: (res) => (cacheControl = res.headers.get('cache-control')),
  });
  assert.equal(cacheControl, 'private, max-age=5');
  assert.equal(projects.length, 1);
  assert.equal(typeof projects[0]!.createdAt, 'string');

  const project = await ada.project.create.mutate({ name: 'Mobile app' });
  const projectId = project.id;
  const task = await ada.task.add.mutate({ projectId, title: 'Ship v1' });
  assert.equal(task.done, false);
  assert.equal(
    (await ada.task.complete.mutate({ taskId: task.id })).done,
    true,
  );

  // A declared error, with its data.
  const [, noTask] = await safe(ada.task.complete.mutate({ taskId: 'nope' }));
  assert.ok(noTask?.code === 'TASK_NOT_FOUND' && noTask.defined);
  assert.equal(noTask.data.taskId, 'nope');

  // The input-replacing middleware's inferred NOT_FOUND.
  const [, noProject] = await safe(ada.project.byId.query({ projectId: 'x' }));
  assert.ok(noProject?.code === 'NOT_FOUND' && noProject.defined);
  assert.equal(noProject.data.projectId, 'x');

  // `ok()` serves stats from the cache until a write changes the tenant's data.
  const cacheOf = async () => {
    let state: string | null = null;
    const stats = await ada.project.stats.query(
      { projectId },
      { onResponse: (res) => (state = res.headers.get('x-cache')) },
    );
    return { ...stats, cache: state };
  };
  assert.deepEqual(await cacheOf(), { tasks: 1, done: 1, cache: 'miss' });
  assert.deepEqual(await cacheOf(), { tasks: 1, done: 1, cache: 'hit' });
  await ada.task.add.mutate({ projectId, title: 'Write docs' });
  assert.deepEqual(await cacheOf(), { tasks: 2, done: 1, cache: 'miss' });

  // A procedure's own response: the client gets the web `Response`.
  const csv = await ada.project.exportCsv.query(
    { projectId },
    { batch: false },
  );
  assert.equal(csv.headers.get('content-type'), 'text/csv');
  assert.match(await csv.text(), /^id,title,done\n.+,"Ship v1",true\n/);

  // Every error `project.create` can fail with, handled exhaustively.
  const api = createSafeClient(ada);
  const reasons: string[] = [];
  for (const tenant of ['globex', 'initech']) {
    const [, err] = await api.project.create.mutate(
      { name: 'One too many' },
      { tenant },
    );
    if (!err) throw new Error(`expected ${tenant} to refuse a project`);
    reasons.push(
      matchError(err, {
        QUOTA_EXCEEDED: (e) => `quota: ${e.data.plan} allows ${e.data.limit}`,
        FORBIDDEN: (e) => `not a member of ${e.data.tenant}`,
        INSUFFICIENT_ROLE: (e) => `needs ${e.data.required}`,
        TENANT_REQUIRED: () => 'no tenant',
        UNAUTHORIZED: () => 'log in',
        BAD_REQUEST: (e) => `invalid: ${e.data.issues.length} issues`,
        builtin: (e) => `${e.code}: ${e.message}`,
      }),
    );
  }
  assert.deepEqual(reasons, [
    'quota: free allows 1',
    'not a member of initech',
  ]);

  // Roles from `.meta({ role })`, checked by the extension.
  const bobSession = await anonymous.auth.login.mutate({
    email: 'bob@acme.test',
  });
  const bob = createApiClient({
    origin,
    token: bobSession.token,
    tenant: 'acme',
  });
  await bob.task.add.mutate({ projectId, title: 'Review' });
  const [, notAdmin] = await safe(bob.admin.members.query());
  assert.ok(notAdmin?.code === 'INSUFFICIENT_ROLE' && notAdmin.defined);
  assert.deepEqual(notAdmin.data, { required: 'admin', actual: 'member' });

  // dedupeLink: two identical queries in flight make one call on the server.
  const before = (await ada.admin.metrics.query())['project.byId']?.ok ?? 0;
  const [a, b] = await Promise.all([
    ada.project.byId.query({ projectId }),
    ada.project.byId.query({ projectId }),
  ]);
  assert.deepEqual(a, b);
  const after = (await ada.admin.metrics.query())['project.byId']?.ok ?? 0;
  assert.equal(after - before, 1);
  // The logger is first in the chain, so it saw both.
  assert.equal(
    log.filter((e) => e.direction === 'up' && e.op.path === 'project.byId')
      .length,
    3,
  );

  // retryLink: a query whose first request fails at the network is retried.
  let attempts = 0;
  const flaky = createApiClient({
    origin,
    token: session.token,
    tenant: 'acme',
    fetch: (input, init) => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new TypeError('fetch failed'))
        : fetch(input, init);
    },
  });
  assert.equal((await flaky.project.list.query()).length, 2);
  assert.equal(attempts, 2);

  // The audit extension recorded every mutation in this tenant.
  const audit = await ada.admin.auditLog.query();
  assert.deepEqual(
    audit.map((entry) => `${entry.path}:${entry.ok}`),
    [
      'project.create:true',
      'task.add:true',
      'task.complete:true',
      'task.complete:false',
      'task.add:true',
      'task.add:true',
    ],
  );
  console.log(`${server.name}: ok (${audit.length} audited writes)`);
}

for (const listen of [listenEffect, listenExpress, listenFastify]) {
  const handler = createApiHandler();
  const server = await listen(handler);
  try {
    await scenario(server);
  } finally {
    await server.close();
    await handler.dispose();
  }
}
