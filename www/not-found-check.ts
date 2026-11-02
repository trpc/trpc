/**
 * Checks the pages a reader gets at a URL the site has no page for, in
 * headless Chrome. The host answers those with `404.html`, the `/404` route
 * prerendered (`build/vercel-output.ts`), and this serves the last build's
 * `dist/client` the same way. Each one has to hydrate without an error (a
 * hydration mismatch, React #418), keep its URL, say it's not found, and
 * leave and come back. `CHROME_PATH` picks the browser. Run with `pnpm
 * not-found:check` after `pnpm build`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('dist/client', import.meta.url).pathname;
const notFoundHeading = 'No procedure at this path';
const paths = [
  '/no-such-page',
  '/no/such/page',
  '/no-such-file.txt',
  '/docs/no-such-page',
  '/docs/v10/no-such-page',
  '/v12/no-such-page',
  '/v12/docs/no-such-page',
  '/v12/docs/client/no-such-page',
  '/v12/decisions/no-such-decision',
  '/blog/no-such-post',
  '/404',
];

const types: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const fileAt = (path: string) =>
  [join(root, path), join(root, path, 'index.html')].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );

const server = createServer((request, response) => {
  const path = decodeURIComponent(
    new URL(request.url ?? '/', 'http://localhost').pathname,
  );
  const file = fileAt(path);
  response.statusCode = file === undefined ? 404 : 200;
  response.setHeader(
    'content-type',
    types[extname(file ?? '404.html')] ?? 'application/octet-stream',
  );
  response.end(readFileSync(file ?? join(root, '404.html')));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

const failures: Array<string> = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const errors: Array<string> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // The page's own 404, which Chrome logs too.
    const ownStatus = message.location().url === page.url();
    if (message.type() === 'error' && !ownStatus) errors.push(message.text());
  });
  const heading = () => page.locator('main h1').first().textContent();

  for (const path of paths) {
    errors.length = 0;
    const problems: Array<string> = [];
    const response = await page.goto(new URL(path, origin).href, {
      waitUntil: 'networkidle',
    });
    if (response?.status() !== 404) {
      problems.push(`answered ${response?.status()}`);
    }
    if ((await page.evaluate(() => location.pathname)) !== path) {
      problems.push(`moved to ${await page.evaluate(() => location.pathname)}`);
    }
    if ((await heading()) !== notFoundHeading) {
      problems.push(`says "${await heading()}"`);
    }
    // The router has the page: the home link and back don't reload it.
    await page.evaluate(() => {
      document.documentElement.dataset['checked'] = '';
    });
    await page.locator('main a[href="/"], main a[href^="/?"]').first().click();
    await page.waitForFunction(() => location.pathname === '/');
    await page.goBack();
    await page.waitForFunction((back) => location.pathname === back, path);
    await page.locator('main h1').first().waitFor();
    if ((await heading()) !== notFoundHeading) {
      problems.push(`back from the home page, says "${await heading()}"`);
    }
    if (
      !(await page.evaluate(
        () => document.documentElement.dataset['checked'] === '',
      ))
    ) {
      problems.push('the home link reloaded the page');
    }
    problems.push(...errors);
    if (problems.length > 0) {
      failures.push(`${path}: ${problems.join('; ')}`);
    }
  }
  console.log(
    `${paths.length} not-found URLs: ${failures.length} with a problem`,
  );
} finally {
  await browser.close();
  server.close();
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
