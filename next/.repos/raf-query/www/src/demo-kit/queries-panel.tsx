import { cn } from "@examples/ui/lib/utils";
import type { QueryClient } from "@raf-query/react";
import { LoaderCircle } from "lucide-react";

import type { FakeServer, NetworkRequest } from "./server.ts";
import {
	type CacheRow,
	type DataStatus,
	useCacheRows,
	useNow,
	useRequests,
} from "./stores.ts";

const dataStyles = {
	error: "bg-destructive/15 text-destructive",
	fresh: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	pending: "bg-muted text-muted-foreground",
	stale: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
} satisfies Record<DataStatus, string>;

const columns =
	"grid grid-cols-[minmax(0,1fr)_4rem_5rem_4.5rem] items-center gap-x-2";

/** How long a row that finished loading keeps its place at the top. */
const holdMs = 1500;

interface Row {
	/** Loading, or finished less than {@link holdMs} ago. */
	readonly active: boolean;
	/** The cache entry, unless it was removed or the row is a write. */
	readonly entry: CacheRow | undefined;
	readonly id: string;
	readonly kind: "query" | "write";
	readonly label: string;
	readonly loading: boolean;
	readonly requests: ReadonlyArray<NetworkRequest>;
}

function lastStart(row: Row) {
	return row.requests.at(-1)?.startedAt ?? 0;
}

/**
 * One row per query, plus a row per write (requests no query sent), and
 * entries removed from the cache while their requests are still in the log.
 * Active rows come first, then the rest by their latest request, newest
 * first. A row that stops loading keeps its place for {@link holdMs}, so a
 * request that ends right away doesn't shuffle the list.
 */
function rowsOf(
	entries: ReadonlyArray<CacheRow>,
	requests: ReadonlyArray<NetworkRequest>,
	now: number,
): ReadonlyArray<Row> {
	const byHash = new Map(entries.map((entry) => [entry.hash, entry]));
	const grouped = new Map<string, Array<NetworkRequest>>();
	for (const request of requests) {
		const id = request.hash ?? `write:${request.label}`;
		grouped.set(id, [...(grouped.get(id) ?? []), request]);
	}
	for (const entry of entries) {
		if (!grouped.has(entry.hash)) {
			grouped.set(entry.hash, []);
		}
	}
	return [...grouped]
		.map(([id, rowRequests]): Row => {
			const first = rowRequests[0];
			const isWrite = first !== undefined && first.hash === undefined;
			const entry = isWrite ? undefined : byHash.get(id);
			const last = rowRequests.at(-1);
			const loading = entry?.isFetching === true || last?.status === "pending";
			return {
				active:
					loading ||
					(last?.endedAt !== undefined && now - last.endedAt < holdMs),
				entry,
				id,
				kind: isWrite ? "write" : "query",
				label: isWrite ? first.label : id,
				loading,
				requests: rowRequests,
			};
		})
		.toSorted(
			(a, b) =>
				Number(b.active) - Number(a.active) || lastStart(b) - lastStart(a),
		);
}

function DataCell(props: { readonly row: Row }) {
	const entry = props.row.entry;
	if (props.row.kind === "write") {
		return <span className="text-muted-foreground">write</span>;
	}
	if (!entry) {
		return <span className="text-muted-foreground">removed</span>;
	}
	return (
		<span className={cn("rounded px-1.5 py-0.5", dataStyles[entry.data])}>
			{entry.data === "pending" ? "none" : entry.data}
		</span>
	);
}

function ReadersCell(props: { readonly row: Row }) {
	const entry = props.row.entry;
	if (!entry) {
		return null;
	}
	return entry.observers > 0 ? (
		<span>{entry.observers} reading</span>
	) : (
		<span className="text-muted-foreground">inactive</span>
	);
}

function RequestsCell(props: { readonly row: Row }) {
	const last = props.row.requests.at(-1);
	if (!last && !props.row.loading) {
		return <span className="text-muted-foreground">none</span>;
	}
	const failures = props.row.entry?.failureCount ?? 0;
	return (
		<span className="flex flex-wrap items-center gap-x-1.5">
			<span
				className="text-muted-foreground tabular-nums"
				title={`${props.row.requests.length} ${props.row.requests.length === 1 ? "request" : "requests"}`}
			>
				{props.row.requests.length}×
			</span>
			{props.row.loading ? (
				<>
					<LoaderCircle
						aria-label="Loading"
						className="size-3 shrink-0 animate-spin text-sky-600 dark:text-sky-400"
						role="img"
					/>
					{failures > 0 ? (
						<span className="text-destructive">{failures} failed</span>
					) : null}
				</>
			) : last?.status === "error" ? (
				<span className="text-destructive">failed</span>
			) : last?.status === "aborted" ? (
				<span className="text-muted-foreground">aborted</span>
			) : null}
		</span>
	);
}

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Slides a row to its new place when the order changes, and fades a new row
 * in. Each row's ref is a new function on every render, so React calls it
 * after every commit, once the DOM is laid out. The row keeps its last
 * position in `data-top`.
 */
function animateRow(element: HTMLElement | null) {
	if (!element) {
		return;
	}
	const before = element.dataset.top;
	const top = element.offsetTop;
	element.dataset.top = String(top);
	if (!element.closest("[data-ready]") || prefersReducedMotion()) {
		return;
	}
	if (before === undefined) {
		element.animate(
			[
				{
					backgroundColor: "rgb(14 165 233 / 0.25)",
					opacity: 0,
					transform: "translateY(-6px)",
				},
				{ backgroundColor: "rgb(14 165 233 / 0.25)", offset: 0.4 },
				{ opacity: 1, transform: "none" },
			],
			{ duration: 900, easing: "ease-out" },
		);
	} else if (Number(before) !== top) {
		element.animate(
			[
				{ transform: `translateY(${Number(before) - top}px)` },
				{ transform: "none" },
			],
			{ duration: 350, easing: "cubic-bezier(0.2, 0, 0, 1)" },
		);
	}
}

/**
 * What the demo's cache holds and what it asked the server for, one row per
 * query: its key and request, its data, whether anything reads it, and
 * whether it's loading.
 */
export function QueriesPanel(props: {
	readonly client: QueryClient<unknown>;
	readonly server: FakeServer<unknown>;
}) {
	const entries = useCacheRows(props.client);
	const requests = useRequests(props.server);
	const now = useNow(250);
	const rows = rowsOf(entries, requests, now);
	return (
		<div
			aria-label="Queries"
			className="font-mono text-[11px]"
			ref={(list) => {
				// React attaches a parent's ref after its children's, so rows on
				// screen at mount don't animate in.
				list?.setAttribute("data-ready", "");
			}}
			role="table"
		>
			<div role="rowgroup">
				<div className={cn(columns, "pb-1 text-muted-foreground")} role="row">
					<span role="columnheader">Query</span>
					<span role="columnheader">Data</span>
					<span role="columnheader">Readers</span>
					<span role="columnheader">Requests</span>
				</div>
			</div>
			<div className="relative" role="rowgroup">
				{rows.length === 0 ? (
					<p className="border-t py-6 text-center font-sans text-xs text-muted-foreground">
						Nothing cached and no requests yet.
					</p>
				) : null}
				{rows.map((row) => {
					const request = row.requests.at(-1)?.label;
					return (
						<div
							className={cn(
								columns,
								"relative border-t py-1 transition-colors duration-300",
								row.loading && "bg-sky-500/10",
							)}
							key={row.id}
							ref={(element) => {
								animateRow(element);
							}}
							role="row"
						>
							<span className="flex min-w-0 items-center gap-1.5" role="cell">
								<span className="grid min-w-0">
									<span
										className={cn(
											"truncate",
											!row.entry && "text-muted-foreground",
										)}
										title={row.label}
									>
										{row.label}
									</span>
									{request && row.kind === "query" ? (
										<span
											className="truncate text-[10px] text-muted-foreground"
											title={request}
										>
											{request}
										</span>
									) : null}
								</span>
							</span>
							<span className="whitespace-nowrap" role="cell">
								<DataCell row={row} />
							</span>
							<span className="whitespace-nowrap" role="cell">
								<ReadersCell row={row} />
							</span>
							<span className="whitespace-nowrap" role="cell">
								<RequestsCell row={row} />
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
