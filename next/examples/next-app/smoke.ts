/**
 * Builds the app, starts `next start`, and checks the server-rendered page and
 * the tRPC route with a Node client. Run with `pnpm smoke`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createTrpcClient, httpLink, routerType } from 'trpcdev/client';
import type { AppRouter } from './src/server/router.ts';
import { serializer } from './src/trpc/serializer.ts';

const next = new URL('node_modules/.bin/next', import.meta.url).pathname;
const cwd = new URL('.', import.meta.url).pathname;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };

const build = spawnSync(next, ['build'], { cwd, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const port = await new Promise<number>((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() =>
      resolve(typeof address === 'object' && address ? address.port : 3000),
    );
  });
});
const server = spawn(next, ['start', '--port', String(port)], {
  cwd,
  env: { ...env, PORT: String(port) },
  stdio: 'inherit',
});
const origin = `http://127.0.0.1:${port}`;

const assert = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

try {
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(origin).then(
      (res) => res.ok,
      () => false,
    );
    if (ready) break;
    assert(attempt < 100, 'next start did not come up');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const html = await (await fetch(origin)).text();
  assert(
    html.includes('Rendered on the server'),
    'page is missing the prefetched post',
  );
  console.log('page: server-rendered with the prefetched post');

  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: `${origin}/api/trpc`, batch: true, serializer })],
  });

  const [first] = await client.post.list.query();
  assert(first?.createdAt instanceof Date, 'post.createdAt is not a Date');
  console.log('post.list:', first);

  const words: string[] = [];
  for await (const word of await client.chat.reply.mutate({
    text: 'hi there',
  })) {
    words.push(word);
  }
  assert(
    words.join('') === 'You said: hi there ',
    `chat.reply: ${words.join('')}`,
  );
  console.log('chat.reply chunks:', words);

  const uploaded = await client.files.upload.mutate({
    file: new File(['some notes'], 'notes.txt', { type: 'text/plain' }),
  });
  assert(uploaded.size === 10, 'files.upload size');
  console.log('files.upload:', uploaded);

  const file = await client.files.download.query({ name: 'report' });
  assert(file.name === 'report.txt', 'files.download name');
  console.log('files.download:', file.name, JSON.stringify(await file.text()));
} finally {
  server.kill();
}
