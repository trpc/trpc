import type { ReactNode } from "react";

declare function useRouterState<T>(options: {
	readonly select: (state: { readonly isLoading: boolean }) => T;
}): T;

declare function ProgressBar(): ReactNode;

// #region pending-ui
function NavigationProgress() {
	const isLoading = useRouterState({ select: (state) => state.isLoading });
	return isLoading ? <ProgressBar /> : null;
}
// #endregion
