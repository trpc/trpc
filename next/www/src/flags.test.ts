import { describe, expect, it } from '@effect/vitest';

import {
  applyFlagParam,
  flagsOn,
  parseOverrides,
  siteEnvOf,
  withFlag,
} from './flags.ts';

describe('withFlag', () => {
  it('turns a flag on, and forgets it when turned off', () => {
    expect(withFlag({}, 'partners', true)).toEqual({ partners: true });
    expect(withFlag({ partners: true }, 'partners', false)).toEqual({});
    expect(withFlag({}, 'partners', false)).toEqual({});
  });
});

describe('flagsOn', () => {
  it('lists the flags turned on', () => {
    expect(flagsOn({ partners: true })).toEqual(['partners']);
    expect(flagsOn({})).toEqual([]);
  });
});

describe('applyFlagParam', () => {
  it('turns flags on by name and off with a `-`', () => {
    expect(applyFlagParam({}, 'partners')).toEqual({ partners: true });
    expect(applyFlagParam({ partners: true }, '-partners')).toEqual({});
  });

  it('turns every flag off on `reset`, then applies what follows it', () => {
    expect(applyFlagParam({ partners: true }, 'reset')).toEqual({});
    expect(
      applyFlagParam({ partners: true }, '-partners, reset, partners'),
    ).toEqual({
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
  it('keeps only known flags turned on', () => {
    expect(
      parseOverrides('{"partners":true,"gone":true,"other":"yes"}'),
    ).toEqual({ partners: true });
  });

  it('counts a flag stored as false as off', () => {
    expect(parseOverrides('{"partners":false}')).toEqual({});
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
