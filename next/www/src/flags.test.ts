import { describe, expect, it } from '@effect/vitest';

import {
  flagParamFor,
  flagsIn,
  siteEnvOf,
  validateFlagSearch,
  withFlag,
} from './flags.ts';

describe('flagsIn', () => {
  it('reads comma-separated experiments, ignoring unknown ones and spaces', () => {
    expect(flagsIn('publisher')).toEqual(['publisher']);
    expect(flagsIn('nope, publisher ,also-nope')).toEqual(['publisher']);
    expect(flagsIn('publisher,publisher')).toEqual(['publisher']);
  });

  it('lists several in the order experiments declares them', () => {
    expect(flagsIn('publisher,contracts')).toEqual(['contracts', 'publisher']);
    expect(flagParamFor(['publisher', 'contracts'])).toBe(
      'contracts,publisher',
    );
    expect(withFlag(['publisher'], 'contracts', true)).toEqual([
      'contracts',
      'publisher',
    ]);
  });

  it('has none without a string, and the old flags are gone', () => {
    expect(flagsIn(undefined)).toEqual([]);
    expect(flagsIn('')).toEqual([]);
    expect(flagsIn(1)).toEqual([]);
    expect(flagsIn('partners,hidden-docs')).toEqual([]);
  });
});

describe('flagParamFor', () => {
  it('lists the experiments, and is undefined for none', () => {
    expect(flagParamFor(['publisher'])).toBe('publisher');
    expect(flagParamFor([])).toBeUndefined();
  });
});

describe('withFlag', () => {
  it('turns an experiment on or off', () => {
    expect(withFlag([], 'publisher', true)).toEqual(['publisher']);
    expect(withFlag(['publisher'], 'publisher', false)).toEqual([]);
    expect(withFlag(['publisher'], 'publisher', true)).toEqual(['publisher']);
  });
});

describe('validateFlagSearch', () => {
  it('keeps the known experiments, and drops the param when it names none', () => {
    expect(validateFlagSearch({ flags: 'publisher,nope' })).toEqual({
      flags: 'publisher',
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
