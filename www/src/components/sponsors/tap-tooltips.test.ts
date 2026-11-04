import { describe, expect, it } from 'vitest';

import { clickPointer, tapAction } from './tap-tooltips.ts';

describe('clickPointer', () => {
  it("takes the click's own pointer, and '' as the keyboard", () => {
    for (const recent of [false, true]) {
      expect(
        clickPointer({ clickType: 'touch', pressType: 'touch', recent }),
      ).toBe('touch');
      expect(clickPointer({ clickType: '', pressType: 'touch', recent })).toBe(
        undefined,
      );
    }
    expect(
      clickPointer({ clickType: 'mouse', pressType: 'mouse', recent: true }),
    ).toBe('mouse');
  });

  it("takes the press that just ended when Safari's click says 'mouse' or nothing", () => {
    for (const clickType of ['mouse', undefined]) {
      expect(
        clickPointer({ clickType, pressType: 'touch', recent: true }),
      ).toBe('touch');
      expect(
        clickPointer({ clickType, pressType: 'touch', recent: false }),
      ).toBe(clickType);
    }
  });
});

describe('tapAction', () => {
  it('follows the link for a mouse or the keyboard, whose hover or focus showed the tooltip', () => {
    for (const pointerType of ['mouse', undefined]) {
      for (const tapped of [false, true]) {
        expect(tapAction({ held: false, pointerType, tapped })).toBe('follow');
      }
    }
  });

  it('shows the tooltip on the first tap, and follows the link on the next', () => {
    for (const pointerType of ['touch', 'pen']) {
      expect(tapAction({ held: false, pointerType, tapped: false })).toBe(
        'show',
      );
      expect(tapAction({ held: false, pointerType, tapped: true })).toBe(
        'follow',
      );
    }
  });

  it("only shows the tooltip after a long press, even when it's showing", () => {
    expect(tapAction({ held: true, pointerType: 'touch', tapped: true })).toBe(
      'show',
    );
  });
});
