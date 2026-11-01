import { safe } from '@trpc12/trpc/client';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it, vi } from '@effect/vitest';

import { createTrpc } from '../../samples/kitchen-sink-files/src/trpc.ts';
import { buildDemo } from './app.ts';
import files from './files.ts';
import { createNetwork } from './network.ts';

async function filesApp() {
  // A page has one: Effect's HTTP client resolves `url: '/trpc'` against it.
  vi.stubGlobal('location', { origin: 'https://trpc.io', pathname: '/' });
  const app = await buildDemo(files, files.files);
  const network = createNetwork(app.server);
  network.latency = 0;
  return { app, client: createTrpc(network.fetch).client, network };
}

/** A PNG's signature, then `size` bytes more: enough for the server's checks. */
function png(size: number, name = 'avatar.png') {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new File([new Uint8Array(signature), new Uint8Array(size)], name, {
    type: 'image/png',
  });
}

describe('the files demo', () => {
  it('sends a File inside an object as multipart, and the panel lists its parts', async () => {
    const demo = await filesApp();
    expect(
      await demo.client.profile.update.mutate({
        name: ' Grace ',
        avatar: png(1000),
      }),
    ).toEqual({ name: 'Grace' });
    const upload = demo.network.requests.at(-1);
    expect(upload?.headers).toMatch(/^content-type: multipart\/form-data/m);
    expect(upload?.body).toContain(
      '(avatar.png, image/png, 1008 B)\n89 50 4e 47 0d 0a 1a 0a 00 00 00 00 00 00 00 00 …',
    );
    expect(upload?.body).toContain('Grace');
  });

  it('gets the avatar back as the response body, a File, which the panel describes', async () => {
    const demo = await filesApp();
    await demo.client.profile.update.mutate({ name: 'Ada', avatar: png(8) });
    const avatar = await demo.client.profile.avatar.query();
    expect(avatar).toBeInstanceOf(File);
    expect(avatar).toMatchObject({
      name: 'avatar.png',
      size: 16,
      type: 'image/png',
    });
    expect(new Uint8Array(await avatar.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    await vi.waitUntil(
      () => demo.network.requests.at(-1)?.outcome === 'responded',
    );
    expect(demo.network.requests.at(-1)?.response).toBe(
      '(avatar.png, image/png, 16 B)\n89 50 4e 47 0d 0a 1a 0a 00 00 00 00 00 00 00 00',
    );
  });

  it('starts with an SVG avatar, which the panel shows as the text it is', async () => {
    const demo = await filesApp();
    const avatar = await demo.client.profile.avatar.query();
    expect(avatar.type).toBe('image/svg+xml');
    await vi.waitUntil(
      () => demo.network.requests.at(-1)?.outcome === 'responded',
    );
    expect(demo.network.requests.at(-1)?.response).toMatch(/^<svg /);
  });

  it("checks the file's size and type on the server, on the avatar field", async () => {
    const demo = await filesApp();
    const [, tooBig] = await safe(
      demo.client.profile.update.mutate({
        name: 'Ada',
        avatar: png(300 * 1024),
      }),
    );
    expect(tooBig?.code).toBe('BAD_REQUEST');
    if (tooBig?.code === 'BAD_REQUEST' && tooBig.defined) {
      expect(
        tooBig.data.issues.map((issue) => [issue.path, issue.message]),
      ).toEqual([[['avatar'], 'At most 200 kB']]);
    }
    const [, notAnImage] = await safe(
      demo.client.profile.update.mutate({
        name: '',
        avatar: new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      }),
    );
    if (notAnImage?.code === 'BAD_REQUEST' && notAnImage.defined) {
      expect(
        notAnImage.data.issues.map((issue) => [issue.path, issue.message]),
      ).toEqual([
        [['name'], 'Enter your name'],
        [['avatar'], 'A PNG, JPEG or WebP image'],
      ]);
    }
    expect(notAnImage?.code).toBe('BAD_REQUEST');
    expect((await demo.client.profile.get.query()).avatar.name).toBe(
      'initials.svg',
    );
  });

  it("loads the profile in the root route's loader", async () => {
    const demo = await filesApp();
    const router = demo.app.getRouter({
      fetch: demo.network.fetch,
      history: createMemoryHistory({ initialEntries: [files.start] }),
    });
    await router.load();
    expect(router.state.status).toBe('idle');
    expect(demo.network.requests.map((request) => request.path)).toEqual([
      '/trpc/profile.get',
    ]);
  });
});
