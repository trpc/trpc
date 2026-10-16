import { Button } from "@examples/ui/components/button";

/**
 * Infinite scroll: a "Load more" button that presses itself when it comes
 * within `rootMargin` of the viewport. Unmount it while the page loads (and
 * show skeletons in its place); it watches again when it remounts, so it keeps
 * loading while it stays in reach.
 */
export function LoadMore(props: { readonly onLoad: () => void }) {
	return (
		<Button
			className="w-full"
			onClick={props.onLoad}
			ref={(button) => {
				if (button === null) {
					return;
				}
				const observer = new IntersectionObserver(
					(entries) => {
						if (entries.some((entry) => entry.isIntersecting)) {
							observer.disconnect();
							props.onLoad();
						}
					},
					{ rootMargin: "0px 0px 300px 0px" },
				);
				observer.observe(button);
				return () => {
					observer.disconnect();
				};
			}}
			variant="outline"
		>
			Load more
		</Button>
	);
}
