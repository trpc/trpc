import { describe, expect, it } from '@effect/vitest';

import {
  flagParamFor,
  flagsIn,
  menuStateOf,
  siteEnvOf,
  validateFlagSearch,
  withFlag,
} from './flags.ts';

describe('flagsIn', () => {
  it('ignores names that are not experiments', () => {
    expect(flagsIn('nope, also-nope')).toEqual([]);
    expect(flagsIn('partners,hidden-docs')).toEqual([]);
  });

  it('has none without a string', () => {
    expect(flagsIn(undefined)).toEqual([]);
    expect(flagsIn('')).toEqual([]);
    expect(flagsIn(1)).toEqual([]);
  });
});

describe('flagParamFor', () => {
  it('is undefined for none', () => {
    expect(flagParamFor([])).toBeUndefined();
    expect(flagParamFor(['nope'])).toBeUndefined();
  });
});

describe('withFlag', () => {
  it('only turns on experiments', () => {
    expect(withFlag([], 'nope', true)).toEqual([]);
  });
});

describe('validateFlagSearch', () => {
  it('drops the param when it names no experiment', () => {
    expect(validateFlagSearch({ flags: 'nope' })).toEqual({});
    expect(validateFlagSearch({ other: 'x' })).toEqual({});
  });

  it('keeps the open menu, and drops unknown experiments', () => {
    expect(validateFlagSearch({ experiments: 'open' })).toEqual({
      experiments: 'open',
    });
    expect(validateFlagSearch({ experiments: 'nope' })).toEqual({});
    expect(validateFlagSearch({ experiments: true })).toEqual({});
  });
});

describe('menuStateOf', () => {
  it('is open or closed', () => {
    expect(menuStateOf('open')).toBe('open');
    expect(menuStateOf('nope')).toBeUndefined();
    expect(menuStateOf(undefined)).toBeUndefined();
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
