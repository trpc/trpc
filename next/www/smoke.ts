/**
 * Drives the site in headless Chrome: scrolled down a docs page and the home
 * page, it presses everything in the Experiments menu a reader might (a
 * row's name, its description, its switch, its pages, "Turn all on" and
 * "Turn all off") and checks that `?flags=` follows and the page doesn't
 * move. `SITE_URL` points it at a deployment; without it, it builds the site
 * and serves it with `vp preview`. `CHROME_PATH` picks the browser. Run with
 * `pnpm smoke`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';

const cwd = new URL('.', import.meta.url).pathname;
const vp = new URL('node_modules/.bin/vp', import.meta.url).pathname;
const port = 3019;

const assert = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

const preview = process.env['SITE_URL']
  ? undefined
  : (() => {
      const build = spawnSync('pnpm', ['build'], { cwd, stdio: 'inherit' });
      if (build.status !== 0) process.exit(build.status ?? 1);
      return spawn(vp, ['preview', '--port', String(port), '--strictPort'], {
        cwd,
        stdio: 'inherit',
      });
    })();
const origin = process.env['SITE_URL'] ?? `http://localhost:${port}`;

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await fetch(origin).then(
      (response) => response.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${origin} didn't answer`);
};

/** Clicks the middle of `selector` with the mouse, as a reader would. */
const press = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  assert(box !== null, `${selector} isn't on the page`);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
};

const flags = (page: Page) =>
  page.evaluate(() => new URLSearchParams(location.search).get('flags'));

const row = (id: string) => `[data-experiment="${id}"]`;
const presses = [
  { flags: 'publisher', target: `${row('publisher')} label .font-medium` },
  {
    flags: 'contracts,publisher',
    target: `${row('contracts')} label .text-xs`,
  },
  { flags: 'contracts', target: `${row('publisher')} [role=switch]` },
  { flags: 'contracts', target: `${row('contracts')} button[aria-expanded]` },
  { flags: undefined, target: 'button:has-text("Turn all on")' },
  { flags: null, target: 'button:has-text("Turn all off")' },
] as const;

await waitForServer();
const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

try {
  for (const path of ['/v12/docs/subscriptions/overview', '/?version=v12']) {
    const page = await browser.newPage({
      viewport: { height: 800, width: 1280 },
    });
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(new URL(path, origin).href);
    await page.waitForLoadState('networkidle');

    const top = await page.evaluate(() => {
      const middle = Math.round(
        (document.documentElement.scrollHeight - innerHeight) / 2,
      );
      scrollTo({ behavior: 'instant', top: middle });
      return scrollY;
    });
    assert(top > 0, `${path} is too short to scroll`);
    await press(page, 'header a[aria-haspopup="dialog"]');
    await page.locator('[data-slot="popover-content"]').waitFor();

    for (const step of presses) {
      await press(page, step.target);
      // Long enough for a smooth scroll to show.
      await page.waitForTimeout(700);
      const now = await page.evaluate(() => scrollY);
      assert(
        now === top,
        `${path}: pressing ${step.target} scrolled from ${top} to ${now}`,
      );
      if (step.flags !== undefined) {
        const value = await flags(page);
        assert(
          value === step.flags,
          `${path}: pressing ${step.target} left ?flags=${value}, not ${step.flags}`,
        );
      }
    }
    assert(errors.length === 0, `${path}: ${errors.join('\n')}`);
    console.log(`${path}: ${presses.length} presses at ${top}px, no scroll`);
    await page.close();
  }
} finally {
  await browser.close();
  preview?.kill();
}
