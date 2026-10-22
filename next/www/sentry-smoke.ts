/**
 * Checks that a deployment reports to Sentry: in headless Chrome, it throws
 * an error on `SITE_URL` (`https://v12.trpc.io` by default) and waits for
 * Sentry's ingest to accept it, then prints what to look for in Sentry's
 * Issues (`decisions/docs-site-sentry.md`). It fails if the deployment was
 * built without a DSN, or the ingest refuses the event. `CHROME_PATH` picks
 * the browser. Run with `pnpm --filter @trpc12/www sentry:smoke`.
 */
import { chromium, type Request } from 'playwright-core';

const site = process.env['SITE_URL'] ?? 'https://v12.trpc.io';
const message = `Sentry smoke test ${new Date().toISOString()}`;
const timeout = 20_000;

/** An envelope's lines: its header, then each item's header and payload. */
const envelopeLines = (body: string): Array<Record<string, unknown>> =>
  body.split('\n').flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === 'object' && parsed !== null
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });

const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);
let failure: string | undefined;
try {
  const page = await browser.newPage();
  let sdkLoaded = false;
  page.on('request', (request) => {
    if (/\/assets\/sentry-browser-[^/]*\.js$/.test(request.url())) {
      sdkLoaded = true;
    }
  });
  const sent = page.waitForRequest(
    (request: Request) =>
      /\/api\/\d+\/envelope\//.test(request.url()) &&
      (request.postData() ?? '').includes(message),
    { timeout },
  );
  await page.goto(site, { waitUntil: 'load' });
  await page.evaluate((text) => {
    setTimeout(() => {
      throw new Error(text);
    }, 0);
  }, message);
  const request = await sent.catch(() => undefined);
  const response = await request?.response();
  if (!request) {
    failure = sdkLoaded
      ? `${site} loaded Sentry's SDK but sent no event in ${timeout / 1000} s`
      : `${site} has no Sentry: the deployment was built without SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN); set it on the Vercel project and redeploy`;
  } else if (!response?.ok()) {
    failure = `Sentry's ingest answered ${response?.status()} ${await response?.text()}`;
  } else {
    const [header, , event] = envelopeLines(request.postData() ?? '');
    const ingest = new URL(request.url());
    console.log(
      [
        `Sentry accepted "${message}" from ${site}:`,
        `  event ${String(header?.['event_id'])}, project ${ingest.pathname.split('/')[2]} at ${ingest.host}`,
        `  environment ${String(event?.['environment'])}, release ${String(event?.['release'])}`,
        'Find it in Sentry → Issues (search the message); it can take a minute.',
      ].join('\n'),
    );
  }
} finally {
  await browser.close();
}
if (failure !== undefined) {
  console.error(failure);
  process.exit(1);
}
