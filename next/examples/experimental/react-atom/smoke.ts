/**
 * Builds the app, serves the build with Vite's preview server and drives it
 * in headless Chrome: the server renders the posts, the browser hydrates the
 * registry without a request, adding a post refetches the list atom once, and
 * the clock subscription ticks. Run with `pnpm smoke`; `CHROME_PATH` picks the
 * browser.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { preview } from 'vite-plus';

const root = new URL('.', import.meta.url).pathname;
// `vp build` builds Start's client and server; `build()` only the client.
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const built = spawnSync(vp, ['build'], { cwd: root, stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);
const server = await preview({
  root,
  logLevel: 'warn',
  preview: { port: 0, host: '127.0.0.1' },
});
const url = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

try {
  const html = await (await fetch(url)).text();
  assert.match(html, /Read with Effect atoms/);
  console.log('SSR: the HTML has the posts');

  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const calls: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/trpc/') && path !== '/api/trpc/clock') {
      calls.push(path.slice(10));
    }
  });

  await page.goto(url);
  await page.waitForFunction(() =>
    Object.keys(document).some((key) => key.startsWith('__reactContainer')),
  );
  const posts = page.getByRole('list', { name: 'Posts' });
  await posts.getByText('Read with Effect atoms').waitFor();
  assert.deepEqual(calls, [], 'hydration made a request');
  console.log('hydrate: rendered from the dehydrated registry, no request');
  await page
    .getByLabel('Clock')
    .getByText(/tick [2-9]/)
    .waitFor();
  console.log('clock: the subscription atom ticks in the browser');

  const title = `Smoke ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  await posts.getByText(title).waitFor();
  assert.deepEqual(calls, ['post.add', 'post.list']);
  console.log('post.add with reactivityKeys: then one post.list refetch');

  await page.reload();
  await posts.getByText(title).waitFor();
  assert.deepEqual(errors, []);
  console.log('reload: the server renders the new post');
} finally {
  await browser.close();
  await server.close();
}
