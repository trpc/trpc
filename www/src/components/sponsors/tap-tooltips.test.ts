import { describe, expect, it } from 'vitest';

import { tapAction } from './tap-tooltips.ts';

describe('tapAction', () => {
  it('follows the link for a mouse or the keyboard, whose hover or focus showed the tooltip', () => {
    for (const pointerType of ['mouse', undefined]) {
      for (const shown of [false, true]) {
        expect(tapAction({ held: false, pointerType, shown })).toBe('follow');
      }
    }
  });

  it('shows the tooltip on the first tap, and follows the link on the next', () => {
    for (const pointerType of ['touch', 'pen']) {
      expect(tapAction({ held: false, pointerType, shown: false })).toBe(
        'show',
      );
      expect(tapAction({ held: false, pointerType, shown: true })).toBe(
        'follow',
      );
    }
  });

  it("only shows the tooltip after a long press, even when it's showing", () => {
    expect(tapAction({ held: true, pointerType: 'touch', shown: true })).toBe(
      'show',
    );
  });
});
