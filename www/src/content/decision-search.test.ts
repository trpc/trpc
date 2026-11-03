import { describe, expect, it } from '@effect/vitest';

import {
  optionParam,
  shownOption,
  validateIndexSearch,
  validateOpenQuestionSearch,
  whoOf,
  whoParamOf,
} from './decision-search.ts';

describe('validateIndexSearch', () => {
  const areas = ['errors', 'mcp'];

  it('keeps the filters it knows', () => {
    expect(
      validateIndexSearch(
        {
          area: 'mcp',
          open: true,
          q: ' safe client ',
          status: 'pr',
          who: 'human-asked',
        },
        areas,
      ),
    ).toEqual({
      area: 'mcp',
      open: true,
      q: 'safe client',
      status: 'pr',
      who: 'human-asked',
    });
  });

  it('drops empty and unknown values, so the default has no query', () => {
    expect(validateIndexSearch({}, areas)).toEqual({});
    expect(
      validateIndexSearch(
        {
          area: 'nope',
          open: false,
          q: '  ',
          status: 'done',
          utm_source: 'x',
          who: 'human asked',
        },
        areas,
      ),
    ).toEqual({});
  });

  it('reads a number the router parsed from ?q= as words', () => {
    expect(validateIndexSearch({ q: 24 }, areas)).toEqual({ q: '24' });
  });

  it('maps the who param to and from a record’s who', () => {
    expect(whoOf('human-asked')).toBe('human asked');
    expect(whoOf(undefined)).toBeUndefined();
    expect(whoParamOf('human asked')).toBe('human-asked');
    expect(whoParamOf('agent')).toBe('agent');
  });
});

describe('validateOpenQuestionSearch', () => {
  it('keeps an option letter, the side-by-side view and open details', () => {
    expect(
      validateOpenQuestionSearch({
        details: 'true',
        option: 'C',
        view: 'side-by-side',
      }),
    ).toEqual({ details: true, option: 'c', view: 'side-by-side' });
  });

  it('drops the rest', () => {
    expect(
      validateOpenQuestionSearch({ details: 1, option: 'cc', view: 'tabs' }),
    ).toEqual({});
  });
});

describe('shownOption', () => {
  const ids = ['A', 'B', 'C'];

  it('shows the option ?option= names, else the recommended one', () => {
    expect(shownOption('c', ids, 'B')).toBe('C');
    expect(shownOption(undefined, ids, 'B')).toBe('B');
    expect(shownOption('z', ids, 'B')).toBe('B');
  });

  it('leaves the recommended option out of the URL', () => {
    expect(optionParam('B', 'B')).toBeUndefined();
    expect(optionParam('C', 'B')).toBe('c');
  });
});
