/**
 * Sentry's settings, which the build reads from its environment and bakes
 * into the site (`src/sentry-config.ts`), and the plugins that upload its
 * source maps (`decisions/docs-site-sentry.md`).
 * Without a DSN the site reports nothing; without an auth token, an
 * organization and a project the build uploads nothing.
 */
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import type { PluginOption } from 'vite';

export type Env = Readonly<Record<string, string | undefined>>;

export interface SentrySettings {
  /** The git branch, a tag on every event. */
  readonly branch: string;
  /** `''` turns Sentry off. */
  readonly dsn: string;
  readonly environment: string;
  /** The commit's SHA, or `''`. */
  readonly release: string;
  readonly tracesSampleRate: number;
}

/** The share of page loads and navigations traced, unless `SENTRY_TRACES_SAMPLE_RATE` says otherwise. */
export const defaultTracesSampleRate = 0.05;

function sampleRate(value: string | undefined) {
  const rate = Number(value);
  return value !== undefined && value !== '' && rate >= 0 && rate <= 1
    ? rate
    : defaultTracesSampleRate;
}

/**
 * Sentry's integration on Vercel names the DSN `NEXT_PUBLIC_SENTRY_DSN`,
 * Next.js's prefix for values the browser may see; the DSN is public.
 */
export const sentrySettings = (env: Env): SentrySettings => ({
  branch: env['VERCEL_GIT_COMMIT_REF'] || env['GITHUB_REF_NAME'] || '',
  dsn: env['SENTRY_DSN'] || env['NEXT_PUBLIC_SENTRY_DSN'] || '',
  environment: env['VERCEL_ENV'] || 'development',
  release: env['VERCEL_GIT_COMMIT_SHA'] || env['GITHUB_SHA'] || '',
  tracesSampleRate: sampleRate(env['SENTRY_TRACES_SAMPLE_RATE']),
});

/**
 * `define` entries for `__TRPC_SENTRY_*__` (`src/env.d.ts`). Not
 * `import.meta.env.*`: Vite adds those to every whole `import.meta.env` it
 * replaces (Effect's and Sentry's read one). Only the server reads the
 * release (`src/sentry-client.ts`). `__SENTRY_DEBUG__` drops the SDK's
 * logging.
 */
export const sentryDefines = (settings: SentrySettings) => ({
  __SENTRY_DEBUG__: 'false',
  __TRPC_SENTRY_BRANCH__: JSON.stringify(settings.branch),
  __TRPC_SENTRY_DSN__: JSON.stringify(settings.dsn),
  __TRPC_SENTRY_ENVIRONMENT__: JSON.stringify(settings.environment),
  __TRPC_SENTRY_RELEASE__: JSON.stringify(settings.release),
  __TRPC_SENTRY_TRACES_SAMPLE_RATE__: JSON.stringify(settings.tracesSampleRate),
});

/**
 * Sentry's Vite plugins, which give the bundles debug IDs, write hidden
 * source maps (no `sourceMappingURL`), upload them and delete them from
 * `dist`, the build's output, so they're never deployed. Only when the build
 * can upload: otherwise the build is what it was without Sentry.
 */
export function sentryUploadPlugins(
  env: Env,
  settings: SentrySettings,
  dist: string,
): Array<PluginOption> {
  const authToken = env['SENTRY_AUTH_TOKEN'];
  const org = env['SENTRY_ORG'];
  const project = env['SENTRY_PROJECT'];
  if (!authToken || !org || !project) {
    return [];
  }
  return sentryTanstackStart({
    authToken,
    // The site has no middleware, and none of the libraries it instruments.
    autoInstrumentMiddleware: false,
    buildTimeInstrumentation: false,
    // A failed upload shouldn't fail the deployment.
    errorHandler: (error) => {
      console.warn(`[sentry] ${error.message}`);
    },
    org,
    project,
    // Injected, the release would change the entry chunk on every deploy;
    // the page brings it instead (`src/sentry-client.ts`).
    release: {
      inject: false,
      ...(settings.release === '' ? {} : { name: settings.release }),
    },
    // Not the default `./**/*.map`, which reaches into `node_modules`.
    sourcemaps: { filesToDeleteAfterUpload: [`${dist}/**/*.map`] },
    telemetry: false,
  });
}
