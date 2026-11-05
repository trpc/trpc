import { describe, expect, it } from '@effect/vitest';

import {
  defaultTracesSampleRate,
  type Env,
  sentryDefines,
  sentrySettings,
  sentryUploadPlugins,
  trpcIo,
} from './sentry.ts';

const vercelPreview = {
  SENTRY_DSN: 'https://public@o1.ingest.sentry.io/2',
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'v12-sentry',
  VERCEL_GIT_COMMIT_SHA: '0123abc',
} satisfies Env;

const trpcIoProduction = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'main',
  VERCEL_GIT_COMMIT_SHA: 'd7f0ddb',
  VERCEL_PROJECT_PRODUCTION_URL: 'trpc.io',
} satisfies Env;

const upload = {
  SENTRY_AUTH_TOKEN: 'sntrys_token',
  SENTRY_ORG: 'trpc',
  SENTRY_PROJECT: 'trpc-v12',
} satisfies Env;

const pluginNames = (plugins: ReturnType<typeof sentryUploadPlugins>) =>
  plugins
    .flat()
    .flatMap((plugin) =>
      plugin && typeof plugin === 'object' && 'name' in plugin
        ? [plugin.name]
        : [],
    );

describe('sentrySettings', () => {
  it("reads a Vercel deployment's DSN, environment, branch and commit", () => {
    expect(sentrySettings(vercelPreview)).toEqual({
      branch: 'v12-sentry',
      dsn: 'https://public@o1.ingest.sentry.io/2',
      environment: 'preview',
      org: '',
      project: '',
      release: '0123abc',
      tracesSampleRate: defaultTracesSampleRate,
    });
  });

  it("reports trpc.io's production build to trpclabs/www without Sentry's variables", () => {
    expect(sentrySettings(trpcIoProduction)).toEqual({
      branch: 'main',
      dsn: trpcIo.dsn,
      environment: 'production',
      org: 'trpclabs',
      project: 'www',
      release: 'd7f0ddb',
      tracesSampleRate: defaultTracesSampleRate,
    });
  });

  it("leaves trpc.io's previews and other projects' production off", () => {
    expect(
      sentrySettings({ ...trpcIoProduction, VERCEL_ENV: 'preview' }),
    ).toMatchObject({ dsn: '', org: '', project: '' });
    expect(
      sentrySettings({
        ...trpcIoProduction,
        VERCEL_PROJECT_PRODUCTION_URL: 'trpc-fork.vercel.app',
      }),
    ).toMatchObject({ dsn: '', org: '', project: '' });
  });

  it("lets Sentry's variables override trpc.io's", () => {
    expect(
      sentrySettings({ ...trpcIoProduction, ...vercelPreview, ...upload }),
    ).toMatchObject({
      dsn: vercelPreview.SENTRY_DSN,
      org: upload.SENTRY_ORG,
      project: upload.SENTRY_PROJECT,
    });
  });

  it('takes the DSN Sentry’s Vercel integration sets', () => {
    expect(
      sentrySettings({ NEXT_PUBLIC_SENTRY_DSN: 'https://public@sentry/1' }).dsn,
    ).toBe('https://public@sentry/1');
  });

  it('is off, in development, without the environment', () => {
    expect(sentrySettings({})).toEqual({
      branch: '',
      dsn: '',
      environment: 'development',
      org: '',
      project: '',
      release: '',
      tracesSampleRate: defaultTracesSampleRate,
    });
  });

  it('takes a sample rate between 0 and 1', () => {
    const rate = (value: string) =>
      sentrySettings({ SENTRY_TRACES_SAMPLE_RATE: value }).tracesSampleRate;
    expect(rate('0')).toBe(0);
    expect(rate('0.5')).toBe(0.5);
    expect(rate('1')).toBe(1);
    expect(rate('')).toBe(defaultTracesSampleRate);
    expect(rate('1.5')).toBe(defaultTracesSampleRate);
    expect(rate('-1')).toBe(defaultTracesSampleRate);
    expect(rate('all')).toBe(defaultTracesSampleRate);
  });
});

describe('sentryDefines', () => {
  it('defines each setting as a literal', () => {
    expect(sentryDefines(sentrySettings(vercelPreview))).toEqual({
      __SENTRY_DEBUG__: 'false',
      __TRPC_SENTRY_BRANCH__: '"v12-sentry"',
      __TRPC_SENTRY_DSN__: '"https://public@o1.ingest.sentry.io/2"',
      __TRPC_SENTRY_ENVIRONMENT__: '"preview"',
      __TRPC_SENTRY_RELEASE__: '"0123abc"',
      __TRPC_SENTRY_TRACES_SAMPLE_RATE__: '0.05',
    });
  });
});

describe('sentryUploadPlugins', () => {
  it('adds nothing unless the build can upload', () => {
    const settings = sentrySettings(vercelPreview);
    expect(sentryUploadPlugins(vercelPreview, settings, '/dist')).toEqual([]);
    for (const missing of Object.keys(upload)) {
      expect(
        sentryUploadPlugins(
          { ...vercelPreview, ...upload, [missing]: '' },
          settings,
          '/dist',
        ),
      ).toEqual([]);
    }
  });

  it("adds Sentry's source map plugins when it can", () => {
    const env = { ...vercelPreview, ...upload };
    const names = pluginNames(
      sentryUploadPlugins(env, sentrySettings(env), '/dist'),
    );
    expect(names).toContain('sentry-tanstackstart-react-source-maps');
    expect(names).toContain('sentry-orchestrion-disabled');
  });

  it("uploads trpc.io's production build's source maps with the auth token alone", () => {
    const env = {
      ...trpcIoProduction,
      SENTRY_AUTH_TOKEN: upload.SENTRY_AUTH_TOKEN,
    };
    expect(
      pluginNames(sentryUploadPlugins(env, sentrySettings(env), '/dist')),
    ).toContain('sentry-tanstackstart-react-source-maps');
    expect(
      sentryUploadPlugins(
        trpcIoProduction,
        sentrySettings(trpcIoProduction),
        '/dist',
      ),
    ).toEqual([]);
  });
});
