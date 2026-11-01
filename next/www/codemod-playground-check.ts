/**
 * Checks the codemod playground (`docs/migrations/from-v11/try-the-codemod.md`)
 * in headless Chrome: the page isn't cross-origin isolated, and Oxc's
 * WebAssembly parser runs the codemod there anyway. Editing the v11 pane
 * rewrites the v12 one, each sample tab shows its own rewrite and steps, a
 * step puts the cursor on its line, "Reset code" brings the sample back, and
 * the page fits a phone and a laptop. It fails on a console error, such as a
 * hydration mismatch. `SITE_URL` points it at a deployment; without it, it
 * serves the last build with `vp preview` (`pnpm build` first). `CHROME_PATH`
 * picks the browser. Run with `pnpm codemod-playground:check`.
 */
import { spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const cwd = new URL('.', import.meta.url).pathname;
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const port = 3017;
const path = '/v12/docs/migrations/from-v11/try-the-codemod';

const origin = process.env['SITE_URL'] ?? `http://localhost:${port}`;

const answers = () =>
  fetch(origin).then(
    (response) => response.ok,
    () => false,
  );

// Another server there would answer for the preview, with some other build.
if (!process.env['SITE_URL'] && (await answers())) {
  throw new Error(`${origin} is taken: stop what serves it`);
}
// Its own process group: `vp` starts the server as a child, which killing
// `vp` alone leaves holding the port.
const preview = process.env['SITE_URL']
  ? undefined
  : spawn(vp, ['preview', '--port', String(port), '--strictPort'], {
      cwd,
      detached: true,
      stdio: 'ignore',
    });
preview?.unref();
let previewExit: number | null | undefined;
preview?.on('exit', (code) => {
  previewExit = code;
});
process.on('exit', () => {
  if (preview?.pid !== undefined && previewExit === undefined) {
    process.kill(-preview.pid);
  }
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (previewExit !== undefined) {
      throw new Error(`vp preview exited (${previewExit})`);
    }
    if (await answers()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${origin} didn't answer`);
};

const failures: Array<string> = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const frame = '[data-codemod-playground-frame]';
const pane = (side: 'v11' | 'v12') =>
  `${frame} section[aria-label^="${side}:"] .cm-content`;
const paneText = (page: Page, side: 'v11' | 'v12') =>
  page.$eval(pane(side), (content) =>
    [...content.querySelectorAll('.cm-line')]
      .map((line) => line.textContent)
      .join('\n'),
  );
const summary = (page: Page) =>
  page.textContent(`${frame} [data-codemod-summary]`);
const waitForText = (page: Page, side: 'v11' | 'v12', text: string) =>
  page
    .waitForFunction(
      (args) =>
        [
          ...(document
            .querySelector(args.selector)
            ?.querySelectorAll('.cm-line') ?? []),
        ]
          .map((line) => line.textContent)
          .join('\n')
          .includes(args.text),
      { selector: pane(side), text },
    )
    .then(
      () => true,
      () => false,
    );

await waitForServer();
const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const errors: Array<string> = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(new URL(path, origin).href, {
    waitUntil: 'load',
  });
  check(response?.ok() === true, `${path} answered ${response?.status()}`);
  const headers = response ? await response.allHeaders() : {};
  check(
    headers['cross-origin-opener-policy'] === undefined &&
      headers['cross-origin-embedder-policy'] === undefined,
    `${path} sends COOP or COEP headers, which the playground shouldn't need`,
  );
  check(
    (await page.evaluate(() => crossOriginIsolated)) === false,
    'the page is cross-origin isolated',
  );

  await page.waitForSelector(pane('v12'));
  check(
    await waitForText(page, 'v12', `initTrpc<{ ctx: Context }>`),
    `the server sample's v12 pane doesn't show initTrpc: ${await paneText(page, 'v12')}`,
  );
  check(
    (await summary(page)) === 'Rewritten, 1 step by hand',
    `the server sample's summary is "${await summary(page)}"`,
  );

  // Edit the v11 pane: the v12 one follows.
  await page.click(pane('v11'));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    "import { TRPCError } from '@trpc/server';\nthrow new TRPCError({ code: 'NOT_FOUND' });\n",
  );
  check(
    await waitForText(
      page,
      'v12',
      "import { TrpcError } from '@trpc12/trpc/server';",
    ),
    `an edit didn't rewrite the v12 pane: ${await paneText(page, 'v12')}`,
  );
  check(
    (await summary(page)) === 'Rewritten, 0 steps by hand',
    `after the edit, the summary is "${await summary(page)}"`,
  );

  // Another sample has its own rewrite; the edit stays with its own tab.
  await page.click(`${frame} [role="tab"]:has-text("Client")`);
  check(
    await waitForText(
      page,
      'v12',
      'transformer: createSyncTransformer(superjson)',
    ),
    `the client sample's v12 pane: ${await paneText(page, 'v12')}`,
  );
  await page.click(`${frame} [role="tab"]:has-text("Server")`);
  check(
    await waitForText(
      page,
      'v11',
      "throw new TRPCError({ code: 'NOT_FOUND' });",
    ),
    `switching back lost the edit: ${await paneText(page, 'v11')}`,
  );
  await page.click(`${frame} button:has-text("Reset code")`);
  check(
    await waitForText(page, 'v11', 'initTRPC.context<Context>()'),
    `"Reset code" didn't bring the sample back: ${await paneText(page, 'v11')}`,
  );

  // A step puts the cursor where it points.
  await page.click(`${frame} [role="tab"]:has-text("Adapter")`);
  await page.waitForSelector(`${frame} [data-codemod-steps] li button`);
  const step = await page.textContent(
    `${frame} [data-codemod-steps] li:nth-child(2) button`,
  );
  check(
    step?.startsWith('server/index.ts:18:5 createFetchHandler') === true,
    `the adapter sample's second step is "${step}"`,
  );
  await page.click(`${frame} [data-codemod-steps] li:nth-child(2) button`);
  const active = await page.textContent(
    `${frame} section[aria-label^="v11:"] .cm-activeLine`,
  );
  check(
    active?.includes('fetchRequestHandler(') === true,
    `the step put the cursor on "${active}"`,
  );

  check(errors.length === 0, `console errors: ${errors.join('; ')}`);

  // Loaded at each width, as a resize lays the page out a moment later. The
  // adapter sample's steps are the longest; the frame clips what overflows
  // it, so the page's width alone wouldn't show a step cut off.
  for (const width of [360, 1280]) {
    const sized = await browser.newPage({ viewport: { height: 900, width } });
    sized.setDefaultTimeout(15_000);
    sized.on('pageerror', (err) =>
      failures.push(`at ${width}px: ${err.message}`),
    );
    await sized.goto(new URL(path, origin).href, { waitUntil: 'load' });
    await sized.waitForSelector(pane('v12'));
    await sized.click(`${frame} [role="tab"]:has-text("Adapter")`);
    await sized.waitForSelector(`${frame} [data-codemod-steps] li button`);
    const problems = await sized.evaluate((selector) => {
      const root = document.documentElement;
      const found: Array<string> = [];
      if (root.scrollWidth > root.clientWidth) {
        found.push(
          `${root.scrollWidth - root.clientWidth}px wider than its window`,
        );
      }
      const box = document.querySelector(selector)?.getBoundingClientRect();
      for (const element of document.querySelectorAll(
        `${selector} [role="tablist"], ${selector} [data-codemod-steps] button`,
      )) {
        if (box && element.getBoundingClientRect().right > box.right + 1) {
          found.push(
            `"${element.textContent?.slice(0, 40)}" runs past the playground`,
          );
        }
      }
      return found;
    }, frame);
    for (const problem of problems) failures.push(`at ${width}px: ${problem}`);
    await sized.close();
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`${path}: the codemod playground works`);
