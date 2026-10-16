import { DEFAULT_LOADER_VERB, LoaderVerb } from "@examples/db/types";

/** The verb a path starts with, or the default outside `/<verb>/…`. */
export function loaderVerbOf(pathname: string): LoaderVerb {
	return (
		LoaderVerb.safeParse(pathname.split("/")[1]).data ?? DEFAULT_LOADER_VERB
	);
}

/**
 * The same page and search under another verb. Outside `/<verb>/…` it goes
 * to the list.
 */
export function withLoaderVerb(
	location: { readonly pathname: string; readonly search: string },
	verb: LoaderVerb,
) {
	const [, first = "", ...rest] = location.pathname.split("/");
	if (!LoaderVerb.safeParse(first).success) {
		return `/${verb}/issues`;
	}
	return `/${[verb, ...rest].join("/")}${location.search}`;
}
