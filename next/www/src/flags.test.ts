import { describe, expect, it } from '@effect/vitest';

import { applyFlagParam, parseOverrides, siteEnvOf } from './flags.ts';

describe('applyFlagParam', () => {
  it('turns flags on by name and off with a `-`', () => {
    expect(applyFlagParam({}, 'partners')).toEqual({ partners: true });
    expect(applyFlagParam({ partners: true }, '-partners')).toEqual({
      partners: false,
    });
  });

  it('forgets every override on `reset`, then applies what follows it', () => {
    expect(applyFlagParam({ partners: false }, 'reset')).toEqual({});
    expect(applyFlagParam({ partners: false }, 'reset, partners')).toEqual({
      partners: true,
    });
  });

  it('ignores names that are not flags', () => {
    expect(applyFlagParam({ partners: true }, 'nope,-also-nope,')).toEqual({
      partners: true,
    });
  });
});

describe('parseOverrides', () => {
  it('keeps only known flags set to a boolean', () => {
    expect(
      parseOverrides('{"partners":true,"gone":true,"other":"yes"}'),
    ).toEqual({ partners: true });
  });

  it('has none for nothing stored, or something that is not an object', () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides('not json')).toEqual({});
    expect(parseOverrides('null')).toEqual({});
    expect(parseOverrides('[true]')).toEqual({});
  });
});

describe('siteEnvOf', () => {
  it('is production only on Vercel production builds', () => {
    expect(siteEnvOf({ DEV: true, VERCEL_ENV: 'production' })).toBe(
      'development',
    );
    expect(siteEnvOf({ DEV: false, VERCEL_ENV: 'production' })).toBe(
      'production',
    );
    expect(siteEnvOf({ DEV: false, VERCEL_ENV: 'preview' })).toBe('preview');
    expect(siteEnvOf({ DEV: false, VERCEL_ENV: '' })).toBe('preview');
  });
});
