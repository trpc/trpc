import { describe, expect, it } from '@effect/vitest';

import { stripHighlightMarkers } from './highlight.ts';

describe('stripHighlightMarkers', () => {
  it('drops the marker and the space before it, and keeps the line', () => {
    expect(
      stripHighlightMarkers('const a = 1; // [!code highlight]\nconst b = 2;'),
    ).toBe('const a = 1;\nconst b = 2;');
  });

  it('leaves other comments alone', () => {
    expect(stripHighlightMarkers('a(); // highlight me')).toBe(
      'a(); // highlight me',
    );
  });
});
