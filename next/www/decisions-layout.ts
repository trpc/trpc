/**
 * Checks the decisions pages' layout in headless Chrome: every page, at a
 * phone's width, a tablet's and a laptop's, and each open question side by
 * side too, fits its window, and nothing in its `<main>` reaches past it
 * (long code scrolls inside its block). It also fails on a console error,
 * such as a hydration mismatch. `SITE_URL` points it at a deployment;
 * without it, it serves the last build with `vp preview` (`pnpm build`
 * first). `CHROME_PATH` picks the browser. Run with `pnpm decisions:layout`.
 */
import { spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const cwd = new URL('.', import.meta.url).pathname;
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const port = 3018;
const widths = [360, 820, 1280] as const;

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

/**
 * What doesn't fit: the page wider than its window, or an element of
 * `<main>` past its right edge, outside anything that scrolls or clips it.
 */
const overflowIn = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main');
    const problems: Array<string> = [];
    if (root.scrollWidth > root.clientWidth) {
      problems.push(`${root.scrollWidth}px wide in ${root.clientWidth}px`);
    }
    if (main === null) {
      return [...problems, 'no <main>'];
    }
    const edge = main.getBoundingClientRect().right;
    const clipped = (element: Element) => {
      for (let up = element.parentElement; up && up !== main;) {
        const style = getComputedStyle(up);
        if (style.overflowX !== 'visible' || style.position === 'fixed') {
          return true;
        }
        up = up.parentElement;
      }
      return false;
    };
    for (const element of main.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > edge + 1 && !clipped(element)) {
        problems.push(
          `<${element.tagName.toLowerCase()} class="${String(element.getAttribute('class')).slice(0, 60)}"> ends ${Math.round(box.right - edge)}px past <main>`,
        );
        break;
      }
    }
    return problems;
  });

await waitForServer();
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
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(new URL('/v12/decisions', origin).href);
  const linked = await page.$$eval('main a[href^="/v12/decisions/"]', (links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  );
  const pages = [
    '/v12/decisions',
    ...new Set(linked.map((href) => href.split('?')[0] ?? href)),
  ];
  const urls = pages.flatMap((path) =>
    path.startsWith('/v12/decisions/open/')
      ? [path, `${path}?view=side-by-side`]
      : [path],
  );

  for (const width of widths) {
    await page.setViewportSize({ height: 900, width });
    for (const url of urls) {
      errors.length = 0;
      const response = await page.goto(new URL(url, origin).href, {
        waitUntil: 'load',
      });
      const problems = [
        ...(response?.ok() ? [] : [`answered ${response?.status()}`]),
        ...(await overflowIn(page)),
        ...errors,
      ];
      if (problems.length > 0) {
        failures.push(`${url} at ${width}px: ${problems.join('; ')}`);
      }
    }
  }
  console.log(
    `${urls.length} decisions pages at ${widths.join(', ')}px: ${failures.length} don't fit`,
  );
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
