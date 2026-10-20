import { describe, expect, it } from 'vite-plus/test';

import { stripInlineCode, textParts } from './inline-code.ts';

describe('textParts', () => {
  it('splits a description into its text and code spans', () => {
    expect(
      textParts(
        'The middleware in `@trpc12/trpc/middleware`, with `t.concat()`.',
      ),
    ).toEqual([
      { code: false, text: 'The middleware in ' },
      { code: true, text: '@trpc12/trpc/middleware' },
      { code: false, text: ', with ' },
      { code: true, text: 't.concat()' },
      { code: false, text: '.' },
    ]);
    expect(textParts('`httpLink`')).toEqual([{ code: true, text: 'httpLink' }]);
    expect(textParts('No code here')).toEqual([
      { code: false, text: 'No code here' },
    ]);
  });
});

describe('stripInlineCode', () => {
  it('drops the backticks and keeps the code', () => {
    expect(
      stripInlineCode('`safe()` returns a tuple; see `matchError()`.'),
    ).toBe('safe() returns a tuple; see matchError().');
    expect(stripInlineCode('A lone ` stays')).toBe('A lone ` stays');
  });
});
