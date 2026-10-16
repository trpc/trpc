/**
 * Most pixels of scroll (code top approaching the sticky line) that map to a
 * full code-center → viewport-center parallax. Shorter = snappier drift.
 */
const FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL = 280;

export type FrameworkModeBarLayoutInput = {
	/**
	 * Viewport rect of `#hero-code`. The pill docks at its top edge, in the
	 * padding reserved above the code.
	 */
	readonly code: {
		readonly left: number;
		readonly top: number;
		readonly width: number;
	};
	/** Viewport bottom of the `#how-it-works` section — the sticky range ends here. */
	readonly howItWorksBottom: number;
	readonly isLarge: boolean;
	readonly pillHeight: number;
	readonly reducedMotion: boolean;
	readonly scrollY: number;
	readonly stickyTop: number;
	readonly viewportWidth: number;
};

export type FrameworkModeBarLayout = {
	/**
	 * Pill center X, in the containing block's coordinates: `#hero-code`'s
	 * box while `absolute`, the viewport while `fixed`.
	 */
	readonly left: number;
	readonly position: "absolute" | "fixed";
	/** 0 centered on the code, 1 fully drifted to the viewport center / stuck. */
	readonly progress: number;
	/** Pill top edge, in the same coordinates as `left`. */
	readonly top: number;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number) {
	return from + (to - from) * t;
}

/**
 * Where the homepage framework pill sits for a given scroll / layout snapshot.
 *
 * - Docked (`absolute`) above the hero code until that spot would scroll under
 *   the header.
 * - Stuck (`fixed`) under the header while `#how-it-works` still has room.
 * - Released: still `fixed`, but `top` tracks the section’s bottom so the pill
 *   stops sliding down and scrolls away with the section — no fade.
 */
export function frameworkModeBarLayout(
	input: FrameworkModeBarLayoutInput,
): FrameworkModeBarLayout {
	const distance = input.code.top - input.stickyTop;
	const docked = distance > 0;
	// Never longer than the distance at the top of the page, so the pill
	// starts on the code center even when the hero sits close to the header.
	const travel = Math.max(
		1,
		Math.min(FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL, distance + input.scrollY),
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
			position: "absolute",
			progress,
			top: 0,
		};
	}

	// Cap under the header by the end of how-it-works: once the section end
	// would push the pill up, follow that edge so it leaves with the section.
	const releaseTop = input.howItWorksBottom - input.pillHeight;
	return {
		left: x,
		position: "fixed",
		progress,
		top: Math.min(input.stickyTop, releaseTop),
	};
}
