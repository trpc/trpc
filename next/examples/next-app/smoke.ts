/**
 * Builds the app, starts `next start`, checks the server-rendered page and the
 * tRPC route with a Node client, then signs the guestbook's Server Action form
 * in headless Chrome. Run with `pnpm smoke`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { chromium } from 'playwright-core';
import type { AppRouter } from './src/server/router.ts';
import { serializer } from './src/trpc/serializer.ts';

const next = new URL('node_modules/.bin/next', import.meta.url).pathname;
const cwd = new URL('.', import.meta.url).pathname;
const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };

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
const page = async () => (await fetch(origin)).text();

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

  const html = await page();
  assert(
    html.includes('Rendered on the server'),
    'page is missing the prefetched post',
  );
  assert(
    html.includes('Cached in the Next data cache'),
    'page is missing the cached guestbook',
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

  // The route handler doesn't revalidate, so the page keeps its cached list.
  await client.guestbook.sign.mutate({
    name: 'smoke',
    message: 'Signed through the route handler',
  });
  assert(
    !(await page()).includes('Signed through the route handler'),
    'the guestbook was not served from the data cache',
  );
  console.log('guestbook: served from the data cache after a route write');

  await signInBrowser();
} finally {
  server.kill();
}

async function signInBrowser() {
  // GitHub's Ubuntu runners have Chrome, so nothing is downloaded.
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const tab = await browser.newPage();
    const errors: string[] = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => {
      if (message.type() === 'error')
        errors.push(`${message.text()} ${message.location().url}`);
    });
    await tab.goto(origin);
    const form = tab.locator('form:has(#guestbook-message)');
    // A form action submitted before hydration would do a full-page POST.
    await tab.waitForFunction(() =>
      Object.keys(document.querySelector('#guestbook-message') ?? {}).some(
        (key) => key.startsWith('__reactFiber'),
      ),
    );
    await tab.evaluate(() => {
      const seen = window as { sawPending?: boolean };
      new MutationObserver(() => {
        if (document.querySelector('[data-pending]')) seen.sawPending = true;
      }).observe(document.body, { subtree: true, childList: true });
    });

    const signed = 'Signed with a Server Action';
    await tab.fill('#guestbook-name', 'Ada');
    await tab.fill('#guestbook-message', signed);
    await form.getByRole('button', { name: 'Sign' }).click();
    await tab
      .locator('[data-testid=entries] li:not([data-pending])', {
        hasText: signed,
      })
      .waitFor();
    assert(
      await tab.evaluate(
        () => (window as { sawPending?: boolean }).sawPending === true,
      ),
      'useOptimistic never showed the pending entry',
    );
    const entries = await tab
      .locator('[data-testid=entries] li')
      .allInnerTexts();
    assert(
      entries.some((text) => text.includes('Signed through the route handler')),
      `the action did not revalidate the cached list: ${entries.join(' | ')}`,
    );
    console.log('guestbook action: optimistic entry, then', entries);

    const fresh = await page();
    assert(
      fresh.includes(signed),
      'a new request still gets the stale guestbook',
    );
    console.log('guestbook: a new request gets the revalidated list');

    await tab.fill('#guestbook-name', 'Ada');
    await tab.fill('#guestbook-message', signed);
    await form.getByRole('button', { name: 'Sign' }).click();
    const alert = await tab.getByTestId('sign-error').innerText();
    assert(
      alert.includes('CONFLICT') &&
        alert.includes('Someone already wrote that'),
      `guestbook conflict: ${alert}`,
    );
    const count = await tab.locator('[data-testid=entries] li').count();
    assert(count === entries.length, `guestbook entries: ${count}`);
    console.log('guestbook action error:', JSON.stringify(alert));

    assert(errors.length === 0, `browser errors: ${errors.join('\n')}`);
  } finally {
    await browser.close();
  }
}
