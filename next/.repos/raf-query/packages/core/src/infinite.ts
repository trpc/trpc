import { Effect, Option, Predicate } from "effect";

import type { InfiniteData, InfiniteQueryOptions } from "./options.ts";
import { replaceEqualDeep } from "./share.ts";

export type Direction = "backward" | "forward";

type Pages = InfiniteData<{ page: unknown; pageParam: unknown }>;
type PagedOptions = InfiniteQueryOptions<{
	error: unknown;
	page: unknown;
	pageParam: unknown;
	services: unknown;
}>;

export function isInfiniteData(data: unknown): data is Pages {
	return (
		Predicate.hasProperty(data, "pages") &&
		Predicate.hasProperty(data, "pageParams") &&
		Array.isArray(data.pages) &&
		Array.isArray(data.pageParams)
	);
}

export function nextPageParam(options: PagedOptions, data: Pages) {
	if (data.pages.length === 0) {
		return undefined;
	}
	return options.getNextPageParam(
		data.pages.at(-1),
		data.pages,
		data.pageParams.at(-1),
		data.pageParams,
	);
}

export function previousPageParam(options: PagedOptions, data: Pages) {
	if (data.pages.length === 0 || !options.getPreviousPageParam) {
		return undefined;
	}
	return options.getPreviousPageParam(
		data.pages[0],
		data.pages,
		data.pageParams[0],
		data.pageParams,
	);
}

function addPage(
	data: Pages,
	page: unknown,
	pageParam: unknown,
	direction: Direction,
	maxPages: number | undefined,
): Pages {
	const forward = direction === "forward";
	const pages = forward ? [...data.pages, page] : [page, ...data.pages];
	const pageParams = forward
		? [...data.pageParams, pageParam]
		: [pageParam, ...data.pageParams];
	if (maxPages === undefined || pages.length <= maxPages) {
		return { pageParams, pages };
	}
	return forward
		? { pageParams: pageParams.slice(-maxPages), pages: pages.slice(-maxPages) }
		: {
				pageParams: pageParams.slice(0, maxPages),
				pages: pages.slice(0, maxPages),
			};
}

function edgeParam(data: Pages, direction: Direction) {
	return direction === "forward" ? data.pageParams.at(-1) : data.pageParams[0];
}

/** The page `data` holds for `pageParam`, compared deeply. */
function pageFor(
	data: Pages | undefined,
	pageParam: unknown,
): Option.Option<unknown> {
	const index =
		data?.pageParams.findIndex(
			(param) => replaceEqualDeep(param, pageParam) === param,
		) ?? -1;
	return index === -1 ? Option.none() : Option.some(data?.pages[index]);
}

/**
 * `data`, a full refetch's pages, with each page that `latest` replaced
 * after the refetch started reading it: that write is newer than the read.
 * A page written before its read started is read again, and the read wins.
 */
function keepWrites(
	data: Pages,
	readFrom: ReadonlyArray<{
		readonly pageParam: unknown;
		readonly seen: Option.Option<unknown>;
	}>,
	latest: Pages | undefined,
): Pages {
	let changed = false;
	const pages = data.pages.map((page, index) => {
		const pageParam = data.pageParams[index];
		const read = readFrom.find(
			(entry) =>
				replaceEqualDeep(entry.pageParam, pageParam) === entry.pageParam,
		);
		const now = pageFor(latest, pageParam);
		if (
			!read ||
			Option.isNone(now) ||
			(Option.isSome(read.seen) && read.seen.value === now.value)
		) {
			return page;
		}
		changed = true;
		return now.value;
	});
	return changed ? { pageParams: data.pageParams, pages } : data;
}

/**
 * A paged query's request. With a `direction`, adds one page at that end of
 * the entry's data, read again with `latest` once the page loads, so data
 * written meanwhile (`setData`, a live subscription) stays. If that data no
 * longer ends at the page param the request started from, the write
 * replaced the list, and the page is dropped. Without a `direction`, loads
 * from the first page param again: as many pages as `current` has, or
 * `pages` if that's more, stopping at the last page. A page written while
 * the refetch was reading it, or after, stays as written ({@link keepWrites}).
 */
export const fetchPages = /*#__PURE__*/ Effect.fnUntraced(function* (
	options: PagedOptions,
	current: Pages | undefined,
	request: { readonly direction?: Direction; readonly pages?: number },
	fetchPage: (
		pageParam: unknown,
		direction: Direction,
	) => Effect.Effect<unknown, unknown>,
	latest: () => Pages | undefined,
): Effect.fn.Return<Pages, unknown> {
	const direction = request.direction;
	if (direction && current) {
		const pageParam =
			direction === "forward"
				? nextPageParam(options, current)
				: previousPageParam(options, current);
		if (pageParam == null) {
			return current;
		}
		const page = yield* fetchPage(pageParam, direction);
		const now = latest() ?? current;
		const startedFrom = edgeParam(current, direction);
		if (
			replaceEqualDeep(startedFrom, edgeParam(now, direction)) !== startedFrom
		) {
			return now;
		}
		return addPage(now, page, pageParam, direction, options.maxPages);
	}

	const count = Math.max(request.pages ?? 1, current?.pages.length ?? 0);
	let data: Pages = { pageParams: [], pages: [] };
	const readFrom: Array<{ pageParam: unknown; seen: Option.Option<unknown> }> =
		[];
	let pageParam =
		current && current.pageParams.length > 0
			? current.pageParams[0]
			: options.initialPageParam;
	for (let index = 0; index < count; index++) {
		if (index > 0) {
			const next = nextPageParam(options, data);
			if (next == null) {
				break;
			}
			pageParam = next;
		}
		readFrom.push({ pageParam, seen: pageFor(latest(), pageParam) });
		const page = yield* fetchPage(pageParam, "forward");
		data = addPage(data, page, pageParam, "forward", options.maxPages);
	}
	return keepWrites(data, readFrom, latest());
});
