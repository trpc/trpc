import { z } from "zod";

/** Homepage (and later docs) examples: which framework the samples show. */
export const frameworkModes = [
	"tanstack-start",
	"nextjs",
	"react-router",
] as const;

export type FrameworkMode = (typeof frameworkModes)[number];

export const defaultFrameworkMode: FrameworkMode = "tanstack-start";

/** Defaults stripped from the URL by `stripSearchParams` on `/`. */
export const homeSearchDefaults = {
	mode: defaultFrameworkMode,
} as const;

export const frameworkModeLabels = {
	nextjs: "Next.js",
	"react-router": "React Router",
	"tanstack-start": "TanStack Start",
} as const satisfies Record<FrameworkMode, string>;

/** Search on `/`: `?mode=nextjs`, `?mode=react-router`, or omitted for TanStack Start. */
export const homeSearchSchema = z.object({
	mode: z.enum(frameworkModes).default(homeSearchDefaults.mode),
});

export type HomeSearch = z.infer<typeof homeSearchSchema>;

/** Drop the default from the URL so `/` stays clean. */
export function frameworkModeSearch(
	mode: FrameworkMode,
): Pick<HomeSearch, "mode"> | Record<string, never> {
	return mode === defaultFrameworkMode ? {} : { mode };
}

/**
 * Apply `data-framework-mode` and move shared step `id`s onto the visible
 * panel only (every mode ships in the static HTML). Stringified into
 * `frameworkModeScript`, so it can't close over module bindings — and it
 * assumes a browser document (the script only runs there).
 */
function applyFrameworkMode(mode: FrameworkMode) {
	document.documentElement.setAttribute("data-framework-mode", mode);
	for (const panel of document.querySelectorAll("[data-framework-panel]")) {
		const on = panel.getAttribute("data-framework-panel") === mode;
		for (const el of panel.querySelectorAll<HTMLElement>("[data-step-id]")) {
			const stepId = el.getAttribute("data-step-id");
			if (!stepId) {
				continue;
			}
			if (on) {
				el.id = stepId;
			} else {
				el.removeAttribute("id");
			}
		}
	}
}

/**
 * Runs before first paint so `/?mode=nextjs` never flashes the prerendered
 * TanStack Start panels. Pairs with `[data-framework-panel]` CSS.
 */
export const frameworkModeScript = `(${applyFrameworkMode.toString()})(((m)=>${JSON.stringify(frameworkModes)}.includes(m)?m:${JSON.stringify(defaultFrameworkMode)})(new URLSearchParams(location.search).get("mode")));`;

/** Keep `<html data-framework-mode>` in sync after client navigations. */
export function syncFrameworkModeAttribute(mode: FrameworkMode) {
	try {
		applyFrameworkMode(mode);
	} catch {
		// No document during SSR; frameworkModeScript handles first paint.
	}
}
