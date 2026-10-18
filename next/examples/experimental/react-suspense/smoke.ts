/**
 * Builds the app, serves the build with Vite's preview server and drives it
 * in headless Chrome: the server renders the posts, the browser hydrates them
 * without a request, and adding a post refetches the list once. Run with
 * `pnpm smoke`; `CHROME_PATH` picks the browser.
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
  assert.match(html, /Read with use\(\) and Suspense/);
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
    if (path.startsWith('/api/trpc/')) calls.push(path.slice(10));
  });

  await page.goto(url);
  await page.waitForFunction(() =>
    Object.keys(document).some((key) => key.startsWith('__reactContainer')),
  );
  const posts = page.getByRole('list', { name: 'Posts' });
  await posts.getByText('Read with use() and Suspense').waitFor();
  assert.deepEqual(calls, [], 'hydration made a request');
  console.log('hydrate: rendered from the dehydrated cache, no request');

  const title = `Smoke ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add' }).click();
  await posts.getByText(title).waitFor();
  assert.deepEqual(calls, ['post.add', 'post.list']);
  console.log('post.add: then one post.list refetch');

  await page.reload();
  await posts.getByText(title).waitFor();
  assert.deepEqual(errors, []);
  console.log('reload: the server renders the new post');
} finally {
  await browser.close();
  await server.close();
}
