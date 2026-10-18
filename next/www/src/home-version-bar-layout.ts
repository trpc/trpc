/**
 * Most pixels of scroll (code top approaching the sticky line) that map to a
 * full code-center → viewport-center parallax. Shorter = snappier drift.
 */
const HOME_VERSION_BAR_PARALLAX_TRAVEL = 280;

export interface HomeVersionBarLayoutInput {
  /**
   * Viewport rect of `#hero-code`. The pill docks at its top edge, in the
   * padding reserved above the code.
   */
  readonly code: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
  };
  readonly isLarge: boolean;
  readonly pillHeight: number;
  readonly reducedMotion: boolean;
  readonly scrollY: number;
  /** Viewport top of the sponsors section: the sticky range ends here. */
  readonly sponsorsTop: number;
  readonly stickyTop: number;
  readonly viewportWidth: number;
}

export interface HomeVersionBarLayout {
  /**
   * Pill center X, in the containing block's coordinates: `#hero-code`'s
   * box while `absolute`, the viewport while `fixed`.
   */
  readonly left: number;
  readonly position: 'absolute' | 'fixed';
  /** 0 centered on the code, 1 fully drifted to the viewport center / stuck. */
  readonly progress: number;
  /** Pill top edge, in the same coordinates as `left`. */
  readonly top: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/**
 * Where the home page's version pill sits for a given scroll / layout snapshot.
 *
 * - Docked (`absolute`) above the hero code until that spot would scroll under
 *   the header.
 * - Stuck (`fixed`) under the header until the sponsors section comes up.
 * - Released: still `fixed`, but `top` tracks the sponsors section's top so
 *   the pill stops sliding down and scrolls away above it, with no fade.
 */
export function homeVersionBarLayout(
  input: HomeVersionBarLayoutInput,
): HomeVersionBarLayout {
  const distance = input.code.top - input.stickyTop;
  const docked = distance > 0;
  // Never longer than the distance at the top of the page, so the pill
  // starts on the code center even when the hero sits close to the header.
  const travel = Math.max(
    1,
    Math.min(HOME_VERSION_BAR_PARALLAX_TRAVEL, distance + input.scrollY),
  );
  const progress = docked ? clamp(1 - distance / travel, 0, 1) : 1;

  const codeCenterX = input.code.left + input.code.width / 2;
  const viewportCenterX = input.viewportWidth / 2;

  let x: number;
  if (!input.isLarge) {
    x = codeCenterX;
  } else if (input.reducedMotion) {
    x = docked ? codeCenterX : viewportCenterX;
  } else {
    x = lerp(codeCenterX, viewportCenterX, progress);
  }

  if (docked) {
    return {
      left: x - input.code.left,
      position: 'absolute',
      progress,
      top: 0,
    };
  }

  // Cap under the header by the sponsors section: once its top would push
  // the pill up, follow that edge so the pill leaves above it.
  const releaseTop = input.sponsorsTop - input.pillHeight;
  return {
    left: x,
    position: 'fixed',
    progress,
    top: Math.min(input.stickyTop, releaseTop),
  };
}
