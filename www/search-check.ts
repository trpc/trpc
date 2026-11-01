/**
 * Checks the search dialog (⌘K) in headless Chrome with every experiment
 * off: from v12's home page and from a v12 page, searching the title of
 * each experiment's page (`experiment:` in its frontmatter, so a new one is
 * checked too) lists that page, marked experimental, and opening it from
 * the home page turns its experiment on (`?flags=`), as visiting it does.
 * `SITE_URL` points it at a deployment; without it, it serves the last build
 * with `vp preview` (`pnpm build` first). `CHROME_PATH` picks the browser.
 * Run with `pnpm search:check`.
 */
import { spawn } from 'node:child_process';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { type Browser, chromium, type Page } from 'playwright-core';

import { docPages } from './build/content.ts';
import { samplesDir } from './build/paths.ts';
import { stripInlineCode } from './src/content/inline-code.ts';
import { v12 } from './src/site.ts';

const cwd = new URL('.', import.meta.url).pathname;
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const port = 3018;
const origin = process.env['SITE_URL'] ?? `http://localhost:${port}`;
const v12Page = `${v12.basePath}/getting-started`;
const v12Home = '/?version=v12';

// `src/flags.ts` reads `import.meta.env`, which only Vite defines.
const flagsOn = (url: string) =>
  new URL(url).searchParams.get('flags')?.split(',') ?? [];

const pages = (
  await Effect.runPromise(
    docPages({
      basePath: v12.basePath,
      contentDir: new URL('docs', import.meta.url).pathname,
      samplesDir,
    }).pipe(Effect.provide(NodeServices.layer)),
  )
).flatMap((page) =>
  page.experiment === undefined
    ? []
    : [
        {
          experiment: page.experiment,
          path: page.path,
          query: stripInlineCode(page.title),
          slug: page.path.slice(v12.basePath.length + 1),
        },
      ],
);
if (pages.length === 0) {
  throw new Error('no page is in an experiment: nothing to check');
}

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

/** A fresh session at `path`, with no experiment on and nothing remembered. */
const open = async (browser: Browser, path: string) => {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (err) => failures.push(`${path}: ${err.message}`));
  await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
  const on = flagsOn(page.url());
  if (on.length > 0) {
    failures.push(`${path} opened with experiments on: ${on.join(', ')}`);
  }
  return page;
};

/** Searches `query` and returns the results' slugs, the experimental ones marked `*`. */
const search = async (page: Page, query: string) => {
  // ⌘K is listened for once the page has hydrated.
  const box = page.getByRole('combobox');
  for (let attempt = 0; !(await box.isVisible()); attempt++) {
    if (attempt === 20) throw new Error("⌘K doesn't open the search dialog");
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(250);
  }
  await box.fill(query);
  await page.waitForFunction(
    (value) =>
      (document.querySelector('[role="combobox"]') as HTMLInputElement | null)
        ?.value === value,
    query,
  );
  return page
    .getByRole('option')
    .evaluateAll((options) =>
      options.map(
        (option) =>
          `${option.id.replace(/^search-/, '')}${option.querySelector('[aria-label="Experimental"]') ? '*' : ''}`,
      ),
    );
};

await waitForServer();
const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

try {
  for (const start of [v12Home, v12Page]) {
    const page = await open(browser, start);
    for (const { query, slug } of pages) {
      const found = await search(page, query);
      if (!found.includes(`${slug}*`)) {
        failures.push(
          `from ${start}, "${query}" doesn't find ${slug} marked experimental: ${found.join(', ') || 'no results'}`,
        );
      }
      await page.keyboard.press('Escape');
    }
    await page.close();
  }

  const firstOf = new Map(pages.map((page) => [page.experiment, page]));
  for (const { experiment, path, query, slug } of firstOf.values()) {
    const page = await open(browser, v12Home);
    const found = await search(page, query);
    if (!found.includes(`${slug}*`)) {
      await page.close();
      continue;
    }
    await page.click(`[id="search-${slug}"]`);
    try {
      await page.waitForURL(
        (url) =>
          url.pathname === path && flagsOn(url.href).includes(experiment),
      );
    } catch {
      failures.push(
        `opening ${slug} from search went to ${page.url()}, without ?flags=${experiment}`,
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `search finds ${pages.length} pages in ${new Set(pages.map((page) => page.experiment)).size} experiments, all off, and opening one turns it on`,
);
