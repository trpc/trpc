/**
 * Starts each runtime's server its own way and runs the client against it:
 * `pnpm start` runs them all, `pnpm start:<runtime>` one (`node start.ts
 * deno lambda` some). Bun and Deno must be on `PATH`; outside CI a missing
 * one is skipped.
 */
import { start as bun } from './bun/start.ts';
import { main } from './client.ts';
import { start as deno } from './deno/start.ts';
import { start as lambda } from './lambda/start.ts';
import { listen } from './server.ts';
import { start as workers } from './workers/start.ts';

const runtimes: Record<string, () => Promise<void>> = {
  async node() {
    await using server = await listen();
    await main(server.url, { runtime: 'node' });
  },
  bun,
  deno,
  lambda,
  workers,
};

const names = process.argv.slice(2);
for (const name of names.length > 0 ? names : Object.keys(runtimes)) {
  const start = runtimes[name];
  if (!start) {
    throw new Error(
      `no runtime ${name}; one of ${Object.keys(runtimes).join(', ')}`,
    );
  }
  await start();
}
