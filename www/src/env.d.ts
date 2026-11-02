interface ImportMetaEnv {
  /** Vercel's `VERCEL_ENV` at build time (`production`, `preview`), or `''` off Vercel. */
  readonly VERCEL_ENV: string;
  /** Where this build is served, at build time (`deploymentOrigin` in `seo.ts`). */
  readonly DEPLOYMENT_ORIGIN: string;
}

/** Sentry's settings, from the build's environment (`build/sentry.ts`). */
declare const __TRPC_SENTRY_BRANCH__: string;
declare const __TRPC_SENTRY_DSN__: string;
declare const __TRPC_SENTRY_ENVIRONMENT__: string;
declare const __TRPC_SENTRY_RELEASE__: string;
declare const __TRPC_SENTRY_TRACES_SAMPLE_RATE__: number;
