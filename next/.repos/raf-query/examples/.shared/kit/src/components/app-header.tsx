import type { LoaderVerb } from "@examples/db/types";
import {
	type LoaderRuntime,
	LoaderVerbHint,
} from "@examples/kit/components/loader-verb";
import type { ReactNode } from "react";

/**
 * The top bar: the app's link to the list, which framework it runs on, its
 * settings, and what the current loader verb does.
 */
export function AppHeader(props: {
	readonly brand: ReactNode;
	readonly framework: string;
	readonly loaders: LoaderRuntime;
	readonly settings: ReactNode;
	readonly verb: LoaderVerb;
}) {
	return (
		<header className="border-b">
			<div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-3 pb-2.5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex min-w-0 items-center gap-3 lg:pb-1">
					{props.brand}
					<span className="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
						raf-query · {props.framework}
					</span>
				</div>
				{props.settings}
			</div>
			<div className="mx-auto max-w-5xl px-4 pb-2.5 sm:px-6">
				<LoaderVerbHint loaders={props.loaders} verb={props.verb} />
			</div>
		</header>
	);
}
