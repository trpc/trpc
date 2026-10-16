import { Button } from "@examples/ui/components/button";
import { X } from "lucide-react";

const storageKey = "raf-query-docs:announcement-dismissed";
/** Change it with the message, so readers who dismissed the old one see the new one. */
const announcementId = "early-minor";
/** Set on `<html>` once dismissed; `styles.css` hides the bar under it. */
const dismissedAttribute = "data-announcement-dismissed";

/** Runs before first paint, so a dismissed bar never flashes in the prerendered HTML. */
export const announcementScript = `(() => {
	try {
		if (localStorage.getItem(${JSON.stringify(storageKey)}) === ${JSON.stringify(announcementId)}) {
			document.documentElement.setAttribute(${JSON.stringify(dismissedAttribute)}, "");
		}
	} catch {}
})();`;

export function AnnouncementBar() {
	return (
		<div
			aria-label="Announcement"
			className="announcement-bar bg-primary text-primary-foreground"
			role="region"
		>
			<div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 sm:px-6">
				<p className="flex-1 text-center text-sm">
					<strong className="font-semibold">raf-query is early.</strong> The API
					can still change between minor releases, so use it at your own risk.
				</p>
				<Button
					aria-label="Dismiss announcement"
					className="hover:bg-primary-foreground/15 hover:text-primary-foreground dark:hover:bg-primary-foreground/15"
					onClick={() => {
						document.documentElement.setAttribute(dismissedAttribute, "");
						localStorage.setItem(storageKey, announcementId);
					}}
					size="icon-xs"
					title="Dismiss announcement"
					variant="ghost"
				>
					<X />
				</Button>
			</div>
		</div>
	);
}
