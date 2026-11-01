import type { AnyRouter, RouterHistory } from '@tanstack/react-router';

import type { DemoDefinition } from './define.ts';
import { DemoModuleError, type DemoFile, loadModules } from './modules.ts';
import type { DemoServer, Fetch } from './network.ts';
import { packages } from './packages.ts';

/** What a demo's entry file's `getRouter()` is given. */
export interface DemoEnv {
  readonly fetch: Fetch;
  readonly history: RouterHistory;
  /** The browser's user, one of the demo's `users`. */
  readonly user?: string | undefined;
}

/** A demo's code, compiled and run once: start a session with it. */
export interface DemoApp {
  readonly getRouter: (env: DemoEnv) => AnyRouter;
  readonly server: DemoServer;
}

function isServer(value: unknown): value is DemoServer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fetch' in value &&
    typeof value.fetch === 'function'
  );
}

/**
 * Runs `files` (the demo's, as edited) and picks out what the kit needs:
 * the server file's `handler` and the entry file's `getRouter`.
 */
export async function buildDemo(
  demo: DemoDefinition,
  files: ReadonlyArray<DemoFile>,
): Promise<DemoApp> {
  const load = await loadModules({ files, packages });
  const handler = load(demo.server)['handler'];
  if (!isServer(handler)) {
    throw new DemoModuleError({
      file: demo.server,
      message: `${demo.server} has to export the tRPC handler as \`handler\`, from \`createFetchHandler()\`.`,
    });
  }
  const getRouter = load(demo.entry)['getRouter'];
  if (typeof getRouter !== 'function') {
    throw new DemoModuleError({
      file: demo.entry,
      message: `${demo.entry} has to export \`getRouter({ fetch, history })\`.`,
    });
  }
  return {
    // SAFETY: the demo's own contract, which its sample app typechecks.
    getRouter: getRouter as DemoApp['getRouter'],
    server: handler,
  };
}
