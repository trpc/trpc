import { createContext, use } from "react";

/** What a variant's browser knows about the frame's session around it. */
export interface DemoSession {
	/** Where the browser opens: a reload's URL, or `undefined` for its own start. */
	readonly location: string | undefined;
	/**
	 * Start the variant over at `location`: a new client and router, and an
	 * emptied server, as a browser reload drops the page's memory.
	 */
	reload(location: string): void;
}

export const DemoSessionContext = createContext<DemoSession | null>(null);

export function useDemoSession(): DemoSession {
	const session = use(DemoSessionContext);
	if (!session) {
		throw new Error("useDemoSession: render it inside a DemoFrame");
	}
	return session;
}
