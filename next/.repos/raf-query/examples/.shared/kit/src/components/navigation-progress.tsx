/**
 * A thin bar across the top of the window. Render it only while a navigation
 * is pending: it waits 150 ms, so instant navigations don't flash it, then
 * creeps towards the end until it unmounts.
 */
export function NavigationProgress() {
	return (
		<span
			aria-label="Loading page"
			className="pointer-events-none fixed inset-x-0 top-0 z-50 block h-0.5 origin-left scale-x-90 bg-primary opacity-100 transition-[scale,opacity] delay-150 ease-[cubic-bezier(0.1,0.6,0.2,1)] [transition-duration:8s,150ms] starting:scale-x-0 starting:opacity-0"
			data-slot="navigation-progress"
			role="progressbar"
		/>
	);
}
