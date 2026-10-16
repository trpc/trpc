import type { QueryClient } from "@raf-query/react";
import type { ComponentType } from "react";

import type { FakeServer } from "./server.ts";

export interface DemoVariant {
	readonly Component: ComponentType;
	/** One sentence on what this variant does, shown next to the switch. */
	readonly description: string;
	/** Its name on the switch. */
	readonly label: string;
	readonly server: FakeServer<unknown>;
}

export interface DemoDefinition {
	/** A fresh client per session; demos that need other defaults pass them here. */
	readonly createClient?: () => QueryClient;
	/** One sentence on what to try. */
	readonly hint: string;
	readonly title: string;
	/**
	 * The demo's ways to run, picked with a switch above it when there are
	 * several. Each has its own client and server, so the network and cache
	 * panels show only its requests, and it keeps its state while another is
	 * shown.
	 */
	readonly variants: ReadonlyArray<DemoVariant>;
	/** What the switch picks, for screen readers. */
	readonly variantsLabel: string;
}

type DemoOptions = Pick<DemoDefinition, "createClient" | "hint" | "title"> &
	(
		| {
				readonly Component: ComponentType;
				readonly server: FakeServer<unknown>;
		  }
		| Pick<DemoDefinition, "variants" | "variantsLabel">
	);

export function defineDemo(demo: DemoOptions): DemoDefinition {
	if ("variants" in demo) {
		return demo;
	}
	const { Component, server, ...rest } = demo;
	return {
		...rest,
		variants: [
			{ Component, description: demo.hint, label: demo.title, server },
		],
		variantsLabel: demo.title,
	};
}
