// #region pending-ui
"use client";
// #endregion

import type { ReactNode } from "react";

declare function Link(props: {
	readonly children?: ReactNode;
	readonly href: string;
}): ReactNode;

declare function useLinkStatus(): { readonly pending: boolean };

declare function Spinner(): ReactNode;

// #region pending-ui

function PendingHint() {
	const { pending } = useLinkStatus();
	return pending ? <Spinner /> : null;
}

<Link href="/issues">
	Issues
	<PendingHint />
</Link>;
// #endregion
