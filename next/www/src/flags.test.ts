import { describe, expect, it } from '@effect/vitest';

import {
  flagParamFor,
  flagsIn,
  siteEnvOf,
  validateFlagSearch,
  withFlag,
} from './flags.ts';

describe('flagsIn', () => {
  it('reads comma-separated names, ignoring unknown ones and spaces', () => {
    expect(flagsIn('partners')).toEqual(['partners']);
    expect(flagsIn('nope, partners ,also-nope')).toEqual(['partners']);
    expect(flagsIn('partners,partners')).toEqual(['partners']);
  });

  it('has none without a string', () => {
    expect(flagsIn(undefined)).toEqual([]);
    expect(flagsIn('')).toEqual([]);
    expect(flagsIn(1)).toEqual([]);
  });
});

describe('flagParamFor', () => {
  it('lists the flags, and is undefined for none', () => {
    expect(flagParamFor(['partners'])).toBe('partners');
    expect(flagParamFor([])).toBeUndefined();
  });
});

describe('withFlag', () => {
  it('turns a flag on or off', () => {
    expect(withFlag([], 'partners', true)).toEqual(['partners']);
    expect(withFlag(['partners'], 'partners', false)).toEqual([]);
    expect(withFlag(['partners'], 'partners', true)).toEqual(['partners']);
  });
});

describe('validateFlagSearch', () => {
  it('keeps the known flags, and drops the param when it names none', () => {
    expect(validateFlagSearch({ flags: 'partners,nope' })).toEqual({
      flags: 'partners',
    });
    expect(validateFlagSearch({ flags: 'nope' })).toEqual({});
    expect(validateFlagSearch({ other: 'x' })).toEqual({});
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
