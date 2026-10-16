import type { QueryHandle } from "@raf-query/react";
import { useRouter } from "@tanstack/react-router";

import type { DocSegment } from "~/content/types.ts";
import type { demoQuery } from "~/demos/registry.ts";

import { DemoEmbed } from "./demo-embed.tsx";

function isElement(target: EventTarget | null): target is Element {
	return target !== null && "closest" in target;
}

function internalHref(target: EventTarget | null, root: HTMLElement) {
	if (!isElement(target)) {
		return undefined;
	}
	const anchor = target.closest("a");
	if (!anchor || !root.contains(anchor) || anchor.target) {
		return undefined;
	}
	const url = new URL(anchor.href, window.location.href);
	if (
		url.origin !== window.location.origin ||
		!url.pathname.startsWith("/docs/")
	) {
		return undefined;
	}
	if (url.pathname === window.location.pathname && url.hash) {
		return undefined;
	}
	return url.pathname + url.hash;
}

/** The code a block shows, without Twoslash's types and error messages. */
function codeText(pre: Element) {
	const copy = pre.cloneNode(true);
	if (!isElement(copy)) {
		return "";
	}
	// A pinned type or an error is a line of its own, in place of the newline
	// after the code line it belongs to.
	for (const metaLine of copy.querySelectorAll(".twoslash-meta-line")) {
		metaLine.replaceWith("\n");
	}
	for (const popup of copy.querySelectorAll(".twoslash-popup-container")) {
		popup.remove();
	}
	// The fold's label isn't part of the sample. The lines stay in the body.
	for (const toggle of copy.querySelectorAll(".code-collapse-toggle")) {
		toggle.remove();
	}
	return copy.textContent.trimEnd();
}

/**
 * Shows a Twoslash hover popup next to its name, inside the viewport. The
 * popup is `position: fixed`, so the code block's scrolling doesn't clip it.
 */
function placePopup(target: EventTarget | null) {
	const hover = isElement(target)
		? target.closest(".twoslash-hover:not(.twoslash-query-persisted)")
		: null;
	const popup = hover?.querySelector<HTMLElement>(
		":scope > .twoslash-popup-container",
	);
	if (!hover || !popup) {
		return;
	}
	const anchor = hover.getBoundingClientRect();
	const margin = 8;
	const below = anchor.bottom + 6;
	popup.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - popup.offsetWidth - margin))}px`;
	popup.style.top = `${
		below + popup.offsetHeight > window.innerHeight - margin
			? Math.max(margin, anchor.top - popup.offsetHeight - 6)
			: below
	}px`;
}

/** Opens or closes a folded code region. The lines stay in the page either way. */
function toggleCodeCollapse(target: EventTarget | null) {
	if (!isElement(target)) {
		return false;
	}
	const button = target.closest("button[data-collapse]");
	const region = button?.closest(".code-collapse");
	const body = region?.querySelector(":scope > .code-collapse-body");
	const closed = button?.querySelector(".code-collapse-when-closed");
	const open = button?.querySelector(".code-collapse-when-open");
	if (!button || !body || !closed || !open) {
		return false;
	}
	const willOpen = body.hasAttribute("hidden");
	body.toggleAttribute("hidden", !willOpen);
	closed.toggleAttribute("hidden", willOpen);
	open.toggleAttribute("hidden", !willOpen);
	button.setAttribute("aria-expanded", String(willOpen));
	return true;
}

/**
 * A page's prerendered HTML, with its demos in between. Links between pages
 * navigate client-side and preload on hover, like the router's `<Link>`.
 */
export function DocBody(props: {
	readonly demos: Readonly<Record<string, QueryHandle<typeof demoQuery>>>;
	readonly segments: ReadonlyArray<DocSegment>;
}) {
	const router = useRouter();
	return (
		<div
			className="prose prose-neutral max-w-none dark:prose-invert"
			onClick={(event) => {
				if (toggleCodeCollapse(event.target)) {
					return;
				}
				const target = event.target;
				const copy = isElement(target)
					? target.closest("button[data-copy]")
					: null;
				if (copy) {
					const pre = copy.parentElement?.querySelector("pre");
					const code = pre ? codeText(pre) : "";
					if (code) {
						void navigator.clipboard.writeText(code).then(() => {
							copy.textContent = "Copied";
							setTimeout(() => {
								copy.textContent = "Copy";
							}, 1500);
						});
					}
					return;
				}
				if (
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				) {
					return;
				}
				const href = internalHref(target, event.currentTarget);
				if (href) {
					event.preventDefault();
					void router.navigate({ to: href });
				}
			}}
			onPointerOver={(event) => {
				placePopup(event.target);
				const href = internalHref(event.target, event.currentTarget);
				if (href) {
					void router.preloadRoute({ to: href });
				}
			}}
		>
			{props.segments.map((segment, index) =>
				segment.kind === "html" ? (
					<div
						// oxlint-disable-next-line react/no-danger -- build-time HTML from our own markdown
						dangerouslySetInnerHTML={{ __html: segment.html }}
						// Segments are a fixed list per page.
						// oxlint-disable-next-line react/no-array-index-key
						key={index}
					/>
				) : (
					<DemoEmbed handle={props.demos[segment.id]} key={segment.id} />
				),
			)}
		</div>
	);
}
