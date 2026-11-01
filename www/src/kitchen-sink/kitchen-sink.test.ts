import { createMemoryHistory } from '@tanstack/react-router';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { describe, expect, it, vi } from '@effect/vitest';

import type { ProfileInput } from '../../samples/kitchen-sink-forms/src/schema.ts';
import type { AppRouter } from '../../samples/kitchen-sink-forms/src/server.ts';
import { buildDemo } from './app.ts';
import { filesOf } from './define.ts';
import { demoIds } from './demos.ts';
import forms from './forms.ts';
import { DemoModuleError, loadModules, type Packages } from './modules.ts';
import { createNetwork } from './network.ts';

async function formsApp() {
  // A page has one: Effect's HTTP client resolves `url: '/trpc'` against it.
  vi.stubGlobal('location', { origin: 'https://trpc.io', pathname: '/' });
  const app = await buildDemo(forms, forms.files);
  const network = createNetwork(app.server);
  network.latency = 0;
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc', fetch: network.fetch })],
  });
  return { app, client, network };
}

const ada = {
  bio: 'Wrote the first program.',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  topics: 'math, engines',
  username: 'ada',
} satisfies ProfileInput;

/** `ada` as the server keeps it, after the schema's transforms. */
const stored = { ...ada, topics: ['math', 'engines'] };

describe('the forms demo', () => {
  it('is a demo, with every file of its sample in the editor', () => {
    expect(demoIds).toContain('forms');
    expect(forms.files.map((file) => file.name)).toContain(forms.open);
    expect(forms.files.map((file) => file.name)).toContain(forms.entry);
  });

  it('saves through the in-page network, which logs the request', async () => {
    const demo = await formsApp();
    const saved = await demo.client.profile.update.mutate({
      ...ada,
      name: '  Ada  ',
    });
    expect(saved.name).toBe('Ada');
    expect(await demo.client.profile.changes.query()).toMatchObject([
      { field: 'name', from: 'Ada Lovelace', to: 'Ada' },
    ]);
    expect(demo.network.requests.map((request) => request.path)).toEqual([
      '/trpc/profile.update',
      '/trpc/profile.changes',
    ]);
    expect(demo.network.requests[0]).toMatchObject({
      method: 'POST',
      status: 200,
    });
  });

  it("fails with the schema's issues, by field", async () => {
    const demo = await formsApp();
    const [, err] = await safe(
      demo.client.profile.update.mutate({ ...ada, name: ' ', username: 'A' }),
    );
    expect(err?.code).toBe('BAD_REQUEST');
    if (err?.code === 'BAD_REQUEST' && err.defined) {
      expect(err.data.issues.map((issue) => issue.path)).toEqual([
        ['name'],
        ['username'],
      ]);
    }
  });

  it('sends the form as typed, and the procedure gets it transformed', async () => {
    const demo = await formsApp();
    const saved = await demo.client.profile.update.mutate({
      ...ada,
      topics: 'TRPC, effect,, ',
      username: ' Grace ',
    });
    expect(saved).toMatchObject({
      topics: ['trpc', 'effect'],
      username: 'grace',
    });
    expect(await demo.client.profile.changes.query()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'topics',
          from: 'math, engines',
          to: 'trpc, effect',
        }),
      ]),
    );
  });

  it("fails on a taken username with the refine's issue, on its field", async () => {
    const demo = await formsApp();
    expect(await demo.client.profile.isTaken.query({ username: 'admin' })).toBe(
      true,
    );
    expect(await demo.client.profile.isTaken.query({ username: 'ada' })).toBe(
      false,
    );
    const [, err] = await safe(
      demo.client.profile.update.mutate({ ...ada, username: ' Admin ' }),
    );
    expect(err?.code).toBe('BAD_REQUEST');
    if (err?.code === 'BAD_REQUEST' && err.defined) {
      expect(
        err.data.issues.map((issue) => [issue.path, issue.message]),
      ).toEqual([[['username'], 'Someone has this username']]);
    }
  });

  it("doesn't look up a username that isn't one", async () => {
    const demo = await formsApp();
    const [, err] = await safe(
      demo.client.profile.update.mutate({ ...ada, username: 'a' }),
    );
    expect(err?.code).toBe('BAD_REQUEST');
    if (err?.code === 'BAD_REQUEST' && err.defined) {
      expect(err.data.issues.map((issue) => issue.message)).toEqual([
        '3 to 20 letters, digits or _',
      ]);
    }
  });

  it('fails with NETWORK_ERROR when the network drops a request', async () => {
    const demo = await formsApp();
    demo.network.failNext();
    const [, err] = await safe(demo.client.profile.get.query());
    expect(err?.code).toBe('NETWORK_ERROR');
    expect(demo.network.requests[0]?.outcome).toBe('failed');
    expect(await demo.client.profile.get.query()).toMatchObject(stored);
  });

  it("starts each run with the server's seed data", async () => {
    const first = await formsApp();
    await first.client.profile.update.mutate({ ...ada, name: 'Grace' });
    const second = await formsApp();
    expect(await second.client.profile.get.query()).toMatchObject(stored);
  });

  it("loads the edit page's profile in its loader", async () => {
    const demo = await formsApp();
    const router = demo.app.getRouter({
      fetch: demo.network.fetch,
      history: createMemoryHistory({ initialEntries: [forms.start] }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe('/edit');
    expect(router.state.status).toBe('idle');
    expect(demo.network.requests.map((request) => request.path)).toEqual([
      '/trpc/profile.get',
    ]);
  });
});

describe('loadModules', () => {
  const packages: Packages = { zod: () => import('zod') };

  it('links the files and gives packages their default exports', async () => {
    const load = await loadModules({
      files: [
        {
          code: "import { z } from 'zod';\nexport const name = z.string().parse('ada');",
          name: 'a.ts',
        },
        {
          code: "import { name } from './a.ts';\nexport default name.toUpperCase();",
          name: 'b.ts',
        },
      ],
      packages,
    });
    expect(load('b.ts')['default']).toBe('ADA');
  });

  it("names the file that imports what the kit doesn't have", async () => {
    const files = [{ code: "import 'left-pad';", name: 'a.ts' }];
    await expect(loadModules({ files, packages })).rejects.toMatchObject({
      file: 'a.ts',
      message:
        "a.ts imports left-pad, which the kitchen sink doesn't have. It has zod.",
    });
  });

  it('names the file and line of a syntax error', async () => {
    const files = [{ code: 'const a = 1;\nconst = 2;', name: 'a.ts' }];
    const error = await loadModules({ files, packages }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(DemoModuleError);
    expect(error).toMatchObject({ file: 'a.ts', line: 2 });
  });

  it('names the file that throws while it runs', async () => {
    const load = await loadModules({
      files: [{ code: "throw new Error('boom');", name: 'a.ts' }],
      packages,
    });
    expect(() => load('a.ts')).toThrow(
      expect.objectContaining({ file: 'a.ts', message: 'boom' }),
    );
  });
});

describe('filesOf', () => {
  it("fails on a file that isn't listed, or listed but missing", () => {
    expect(() =>
      filesOf({ './src/a.ts': '', './src/b.ts': '' }, ['a.ts', 'c.ts']),
    ).toThrow("b.ts isn't listed, c.ts doesn't exist");
  });
});
