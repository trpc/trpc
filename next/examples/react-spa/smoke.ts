/**
 * Builds the app with `vp build`, serves it with both APIs (`server.ts`) and
 * drives it in headless Chrome: the infinite list, optimistic writes, live
 * comments and counters, and a mutation queued offline that resumes after a
 * reload. `cache.test.ts` checks the same cache behaviour in process. Run
 * with `pnpm smoke`; `CHROME_PATH` picks the browser.
 */
import { spawnSync } from 'node:child_process';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { chromium, type Page } from 'playwright-core';
import { type AppRouter, listen } from './server.ts';
import { transformer } from './src/transformer.ts';
import { storageKey } from './src/storage-key.ts';

const cwd = new URL('.', import.meta.url).pathname;
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const build = spawnSync(vp, ['build'], { cwd, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const assert = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

await using server = await listen();
const tracker = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: server.url, batch: true, transformer })],
});
const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

const titles = async (page: Page) =>
  page
    .getByRole('list', { name: 'Issues' })
    .getByRole('listitem')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(new URL('/', server.url).href);

  // Infinite list: five a page, newest first, names from the directory API.
  const issues = page.getByRole('list', { name: 'Issues' });
  await issues
    .getByRole('listitem', { name: 'Vite build without Next' })
    .waitFor();
  assert((await titles(page)).length === 5, 'first page has 5 issues');
  await issues.getByText('Linus Torvalds').first().waitFor();
  await page.getByRole('button', { name: 'Load more' }).click();
  await page.getByRole('button', { name: 'Load more' }).click();
  await issues
    .getByRole('listitem', { name: 'Batch requests made in the same tick' })
    .waitFor();
  assert((await titles(page)).length === 12, 'three pages hold all 12');
  assert(
    (await page.getByRole('button', { name: 'Load more' }).count()) === 0,
    'no fourth page',
  );
  console.log('issue.list: 3 pages of infiniteOptions, 12 issues');

  // Live counters (liveOptions) follow every change.
  const stats = page.getByLabel('Stats');
  await stats.getByText('8 open').waitFor();

  // Optimistic create: the draft goes first, the server's issue replaces it.
  await page.getByLabel('New issue title').fill('Smoke: optimistic create');
  await page.getByRole('button', { name: 'New issue' }).click();
  await issues.getByText('#13 ·').waitFor();
  assert(
    (await titles(page))[0] === 'Smoke: optimistic create',
    'created issue is first',
  );
  await stats.getByText('9 open').waitFor();
  const activity = page.getByRole('list', { name: 'Activity' });
  await activity.getByText('#13 opened: Smoke: optimistic create').waitFor();
  console.log('issue.create: optimistic, then #13; stats and activity live');

  // Suspense detail, and comments from the subscription.
  await issues
    .getByRole('button', { name: 'Smoke: optimistic create', exact: true })
    .click();
  const comments = page.getByRole('list', { name: 'Comments' });
  await comments.getByText('No comments yet.').waitFor();
  await page.getByText('Live', { exact: true }).waitFor();
  await tracker.comment.add.mutate({
    issueId: '13',
    author: 'grace',
    body: 'Sent from another client',
  });
  await comments.getByText('Sent from another client').waitFor();
  await comments.getByText('Grace Hopper').waitFor();
  await page
    .getByLabel('Comment', { exact: true })
    .fill('Sent from the browser');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await comments.getByText('Sent from the browser').waitFor();
  await stats.getByText('2 comments').waitFor();
  console.log('comment.onAdd: useSubscription delivered both comments');

  // Optimistic status change.
  await page.getByRole('button', { name: 'Close issue' }).click();
  await page.getByRole('button', { name: 'Reopen issue' }).waitFor();
  await stats.getByText('8 open').waitFor();
  const closed = await tracker.issue.byId.query({ id: '13' });
  assert(closed.status === 'closed', 'server has #13 closed');

  // Optimistic delete.
  await page
    .getByRole('button', { name: 'Delete Vite build without Next' })
    .click();
  await issues
    .getByRole('listitem', { name: 'Vite build without Next' })
    .waitFor({ state: 'detached' });
  const [, gone] = await safe(tracker.issue.byId.query({ id: '12' }));
  assert(gone?.code === 'NOT_FOUND', 'server deleted #12');
  console.log('issue.setStatus, issue.delete: optimistic, confirmed');

  // Offline: the mutation pauses and is persisted with the cache; after a
  // reload it resumes through the defaults registered for its key.
  await page.getByRole('switch', { name: 'Offline' }).click();
  await page.getByLabel('New issue title').fill('Smoke: queued offline');
  await page.getByRole('button', { name: 'New issue' }).click();
  const queued = issues.getByRole('listitem', {
    name: 'Smoke: queued offline',
  });
  await queued.getByText('Queued', { exact: true }).waitFor();
  await page.getByText('1 queued').waitFor();
  await page.waitForFunction((key) => {
    const persisted: {
      clientState?: { mutations: { state: { isPaused: boolean } }[] };
    } = JSON.parse(localStorage.getItem(key) ?? '{}');
    return persisted.clientState?.mutations.some(
      (mutation) => mutation.state.isPaused,
    );
  }, storageKey);
  const before = await tracker.issue.list.query({ limit: 50 });
  assert(
    before.items.every((issue) => issue.title !== 'Smoke: queued offline'),
    'the server has not seen the queued issue',
  );
  await page.reload();
  await queued.getByText('#14 ·').waitFor();
  const after = await tracker.issue.list.query({ limit: 1 });
  assert(
    after.items[0]?.title === 'Smoke: queued offline',
    'the queued issue reached the server after the reload',
  );
  console.log('offline: paused, persisted, resumed after reload as #14');

  assert(errors.length === 0, `browser errors:\n${errors.join('\n')}`);
} finally {
  await browser.close();
}
