"use client";

import { Query, type QueryClient } from "@raf-query/core";
import { Effect, Predicate } from "effect";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useState,
	useSyncExternalStore,
} from "react";

import {
	countByStatus,
	type DevtoolsStatus,
	type QueryRow,
	type SortBy,
	sortOrders,
	statuses,
	useQueryRows,
	visibleRows,
} from "./devtools-store.ts";
import { useOptionalQueryClient } from "./provider.tsx";

export type DevtoolsTheme = "dark" | "light" | "system";

export interface QueryDevtoolsPanelProps {
	/** The client to inspect. Default: the nearest `QueryClientProvider`'s. */
	readonly client?: QueryClient;
	/** Shows a close button that calls this. */
	readonly onClose?: () => void;
	/** Styles for the panel's root element, e.g. its height. */
	readonly style?: CSSProperties;
	/** Default: `"system"`. */
	readonly theme?: DevtoolsTheme;
}

export interface QueryDevtoolsProps {
	/** Corner of the toggle button. Default: `"bottom-right"`. */
	readonly buttonPosition?:
		| "bottom-left"
		| "bottom-right"
		| "top-left"
		| "top-right";
	/** The client to inspect. Default: the nearest `QueryClientProvider`'s. */
	readonly client?: QueryClient;
	/** Open on the first visit. Later visits remember the last open state. */
	readonly initialIsOpen?: boolean;
	/** Edge of the viewport the panel docks to. Default: `"bottom"`. */
	readonly position?: "bottom" | "left" | "right" | "top";
	/** Default: `"system"`. */
	readonly theme?: DevtoolsTheme;
}

interface Palette {
	readonly accent: string;
	readonly background: string;
	readonly boolean: string;
	readonly border: string;
	readonly muted: string;
	readonly number: string;
	readonly raised: string;
	readonly selected: string;
	readonly string: string;
	readonly text: string;
}

const palettes = {
	dark: {
		accent: "#978bff",
		background: "#0f172a",
		boolean: "#f472b6",
		border: "#334155",
		muted: "#94a3b8",
		number: "#fbbf24",
		raised: "#1e293b",
		selected: "#2b2653",
		string: "#4ade80",
		text: "#e2e8f0",
	},
	light: {
		accent: "#6c48ea",
		background: "#ffffff",
		boolean: "#be185d",
		border: "#cbd5e1",
		muted: "#64748b",
		number: "#b45309",
		raised: "#f1f5f9",
		selected: "#e9e8ff",
		string: "#15803d",
		text: "#0f172a",
	},
} satisfies Record<"dark" | "light", Palette>;

/** The logo's gradient: blue through violet to coral. */
const brandGradient = "linear-gradient(135deg, #3b8eea, #7b5cff, #ff4d6d)";

const statusColors = {
	error: "#dc2626",
	fetching: "#2563eb",
	fresh: "#16a34a",
	inactive: "#64748b",
	stale: "#ca8a04",
} satisfies Record<DevtoolsStatus, string>;

const sortLabels = {
	hash: "Key",
	status: "Status",
	updated: "Last updated",
} satisfies Record<SortBy, string>;

const fontFamily =
	'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const monoFamily =
	'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Entries an expanded object, array, map, or set lists before "… more". */
const maxChildren = 100;
const minSize = 120;
const defaultSize = 320;
const storageKeys = {
	open: "raf-query-devtools:open",
	size: "raf-query-devtools:size",
};

const noop = () => {};
const subscribeNever = () => noop;

/** `false` on the server and while hydrating, then `true`. */
function useIsClient() {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
}

function subscribeColorScheme(onChange: () => void) {
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

function prefersDark() {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function usePalette(theme: DevtoolsTheme = "system"): Palette {
	const systemDark = useSyncExternalStore(
		subscribeColorScheme,
		prefersDark,
		() => true,
	);
	if (theme === "system") {
		return systemDark ? palettes.dark : palettes.light;
	}
	return palettes[theme];
}

function useDevtoolsClient(client: QueryClient | undefined): QueryClient {
	const contextClient = useOptionalQueryClient();
	const resolved = client ?? contextClient;
	if (!resolved) {
		throw new Error(
			"raf-query devtools: pass `client` or render inside a QueryClientProvider",
		);
	}
	return resolved;
}

function readStored(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Storage can be full or disabled; the panel still works without it.
	}
}

function formatTime(updatedAt: number) {
	return updatedAt === 0 ? "never" : new Date(updatedAt).toLocaleTimeString();
}

/** One-line form of a value, for leaves and collapsed nodes. */
export function preview(value: unknown): string {
	if (Predicate.isString(value)) {
		return JSON.stringify(value);
	}
	if (Predicate.isBigInt(value)) {
		return `${value}n`;
	}
	if (Predicate.isSymbol(value)) {
		return value.toString();
	}
	if (Predicate.isFunction(value)) {
		return `ƒ ${value.name || "anonymous"}()`;
	}
	if (Predicate.isDate(value)) {
		return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
	}
	if (Predicate.isError(value)) {
		return `${value.name}: ${value.message}`;
	}
	if (Predicate.isRegExp(value)) {
		return String(value);
	}
	if (Predicate.isPromiseLike(value)) {
		return "Promise";
	}
	if (Array.isArray(value)) {
		return `Array(${value.length})`;
	}
	if (Predicate.isMap(value)) {
		return `Map(${value.size})`;
	}
	if (Predicate.isSet(value)) {
		return `Set(${value.size})`;
	}
	if (Predicate.isObject(value)) {
		const size = Object.keys(value).length;
		return size === 1 ? "{1 key}" : `{${size} keys}`;
	}
	return String(value);
}

/** Labelled children of a value the explorer can expand, else `undefined`. */
function childrenOf(
	value: unknown,
): ReadonlyArray<readonly [string, unknown]> | undefined {
	if (Array.isArray(value)) {
		return value.map((item, index) => [String(index), item]);
	}
	if (Predicate.isMap(value)) {
		return [...value].map(([key, item]) => [preview(key), item]);
	}
	if (Predicate.isSet(value)) {
		return [...value].map((item, index) => [String(index), item]);
	}
	if (
		!Predicate.isObject(value) ||
		Predicate.isDate(value) ||
		Predicate.isError(value) ||
		Predicate.isRegExp(value) ||
		Predicate.isPromiseLike(value)
	) {
		return undefined;
	}
	return Object.entries(value);
}

function colorOf(value: unknown, palette: Palette) {
	if (Predicate.isString(value)) {
		return palette.string;
	}
	if (Predicate.isNumber(value) || Predicate.isBigInt(value)) {
		return palette.number;
	}
	if (Predicate.isBoolean(value)) {
		return palette.boolean;
	}
	if (Predicate.isNullish(value)) {
		return palette.muted;
	}
	return palette.text;
}

function copyText(value: unknown) {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return preview(value);
	}
}

function Explorer(props: {
	readonly depth: number;
	readonly label?: string;
	readonly palette: Palette;
	readonly value: unknown;
}) {
	const [expanded, setExpanded] = useState(props.depth < 1);
	const children = childrenOf(props.value);
	const palette = props.palette;
	const label =
		props.label === undefined ? null : (
			<span style={{ color: palette.accent }}>{`${props.label}: `}</span>
		);
	if (children === undefined) {
		return (
			<div style={{ paddingLeft: 14 }}>
				{label}
				<span style={{ color: colorOf(props.value, palette) }}>
					{preview(props.value)}
				</span>
			</div>
		);
	}
	return (
		<div>
			<button
				aria-expanded={expanded}
				onClick={() => setExpanded(!expanded)}
				style={{
					background: "none",
					border: "none",
					color: palette.text,
					cursor: "pointer",
					font: "inherit",
					padding: 0,
					textAlign: "left",
				}}
				type="button"
			>
				<span aria-hidden style={{ display: "inline-block", width: 14 }}>
					{expanded ? "▾" : "▸"}
				</span>
				{label}
				<span style={{ color: palette.muted }}>{preview(props.value)}</span>
			</button>
			{expanded ? (
				<div style={{ paddingLeft: 14 }}>
					{children.slice(0, maxChildren).map(([key, item]) => (
						<Explorer
							depth={props.depth + 1}
							key={key}
							label={key}
							palette={palette}
							value={item}
						/>
					))}
					{children.length > maxChildren ? (
						<div style={{ color: palette.muted, paddingLeft: 14 }}>
							{`… ${children.length - maxChildren} more`}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function StatusChip(props: {
	readonly count: number;
	readonly palette: Palette;
	readonly status: DevtoolsStatus;
}) {
	return (
		<span
			data-status={props.status}
			style={{
				alignItems: "center",
				background: props.palette.raised,
				border: `1px solid ${props.palette.border}`,
				borderRadius: 999,
				display: "inline-flex",
				gap: 6,
				padding: "2px 8px",
			}}
		>
			<span
				aria-hidden
				style={{
					background: statusColors[props.status],
					borderRadius: 999,
					height: 8,
					width: 8,
				}}
			/>
			{`${props.status} ${props.count}`}
		</span>
	);
}

function ActionButton(props: {
	readonly color: string;
	readonly disabled?: boolean;
	readonly label: string;
	readonly onClick: () => void;
}) {
	return (
		<button
			disabled={props.disabled}
			onClick={props.onClick}
			style={{
				background: props.color,
				border: "none",
				borderRadius: 4,
				color: "#ffffff",
				cursor: props.disabled ? "not-allowed" : "pointer",
				font: "inherit",
				opacity: props.disabled ? 0.5 : 1,
				padding: "4px 10px",
			}}
			type="button"
		>
			{props.label}
		</button>
	);
}

function Heading(props: { readonly palette: Palette; readonly title: string }) {
	return (
		<h3
			style={{
				background: props.palette.raised,
				borderBottom: `1px solid ${props.palette.border}`,
				borderTop: `1px solid ${props.palette.border}`,
				fontSize: 12,
				fontWeight: 600,
				margin: 0,
				padding: "4px 8px",
			}}
		>
			{props.title}
		</h3>
	);
}

function Field(props: {
	readonly children: string;
	readonly label: string;
	readonly palette: Palette;
}) {
	return (
		<div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
			<dt style={{ color: props.palette.muted }}>{props.label}</dt>
			<dd style={{ margin: 0, textAlign: "right" }}>{props.children}</dd>
		</div>
	);
}

function QueryDetails(props: {
	readonly client: QueryClient;
	readonly palette: Palette;
	readonly row: QueryRow;
}) {
	const palette = props.palette;
	const query = props.row.query;
	const state = props.row.state;
	const options = query.options;
	const meta = Query.metaUnsafe(query);
	const section = { padding: 8 };
	return (
		<section
			aria-label="Query details"
			style={{ flex: 1, minWidth: 0, overflow: "auto" }}
		>
			<Heading palette={palette} title="Query details" />
			<div style={section}>
				<pre
					style={{
						fontFamily: monoFamily,
						margin: "0 0 8px",
						whiteSpace: "pre-wrap",
						wordBreak: "break-all",
					}}
				>
					{JSON.stringify(query.key, null, 2)}
				</pre>
				<dl style={{ display: "grid", gap: 4, margin: 0 }}>
					<Field label="Status" palette={palette}>
						{props.row.status}
					</Field>
					<Field label="Observers" palette={palette}>
						{String(props.row.observers)}
					</Field>
					<Field label="Last updated" palette={palette}>
						{formatTime(state.updatedAt)}
					</Field>
					<Field label="Kind" palette={palette}>
						{options === undefined ? "hydrated" : options.kind}
					</Field>
					<Field label="Failures" palette={palette}>
						{String(state.failureCount)}
					</Field>
				</dl>
			</div>
			<Heading palette={palette} title="Actions" />
			<div style={{ ...section, display: "flex", flexWrap: "wrap", gap: 6 }}>
				<ActionButton
					color={statusColors.fetching}
					disabled={options === undefined || state.isFetching}
					label="Refetch"
					onClick={() => void Effect.runPromise(Query.refetch(query))}
				/>
				<ActionButton
					color={statusColors.stale}
					label="Invalidate"
					onClick={() => void Effect.runPromise(Query.invalidate(query))}
				/>
				<ActionButton
					color={statusColors.inactive}
					label="Reset"
					onClick={() => void Effect.runPromise(Query.reset(query))}
				/>
				<ActionButton
					color={statusColors.error}
					label="Remove"
					onClick={() =>
						props.client.remove({ exact: true, queryKey: query.key })
					}
				/>
			</div>
			{state.error == null ? null : (
				<>
					<Heading palette={palette} title="Error" />
					<div style={{ ...section, color: statusColors.error }}>
						<div>{preview(state.error)}</div>
						{Predicate.isError(state.error) && state.error.stack ? (
							<pre
								style={{
									fontFamily: monoFamily,
									fontSize: 11,
									margin: "6px 0 0",
									whiteSpace: "pre-wrap",
								}}
							>
								{state.error.stack}
							</pre>
						) : null}
					</div>
				</>
			)}
			<Heading palette={palette} title="Data" />
			<div style={{ ...section, fontFamily: monoFamily }}>
				<button
					onClick={() =>
						void navigator.clipboard?.writeText(copyText(state.data))
					}
					style={{
						background: "none",
						border: `1px solid ${palette.border}`,
						borderRadius: 4,
						color: palette.text,
						cursor: "pointer",
						float: "right",
						font: "inherit",
						fontFamily,
						padding: "2px 8px",
					}}
					type="button"
				>
					Copy
				</button>
				<Explorer depth={0} palette={palette} value={state.data} />
			</div>
			<Heading palette={palette} title="Input" />
			<div style={{ ...section, fontFamily: monoFamily }}>
				<Explorer depth={0} palette={palette} value={query.handle.input} />
			</div>
			{meta === undefined ? null : (
				<>
					<Heading palette={palette} title="Meta" />
					<div style={{ ...section, fontFamily: monoFamily }}>
						<Explorer depth={0} palette={palette} value={meta} />
					</div>
				</>
			)}
		</section>
	);
}

function QueryList(props: {
	readonly onSelect: (hash: string) => void;
	readonly palette: Palette;
	readonly rows: ReadonlyArray<QueryRow>;
	readonly selectedHash: string | undefined;
}) {
	const palette = props.palette;
	if (props.rows.length === 0) {
		return (
			<p style={{ color: palette.muted, margin: 0, padding: 12 }}>No queries</p>
		);
	}
	return (
		<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
			{props.rows.map((row) => (
				<li key={row.hash}>
					<button
						aria-pressed={row.hash === props.selectedHash}
						data-status={row.status}
						onClick={() => props.onSelect(row.hash)}
						style={{
							alignItems: "center",
							background:
								row.hash === props.selectedHash
									? palette.selected
									: "transparent",
							border: "none",
							borderBottom: `1px solid ${palette.border}`,
							color: palette.text,
							cursor: "pointer",
							display: "flex",
							font: "inherit",
							gap: 8,
							padding: "4px 8px",
							textAlign: "left",
							width: "100%",
						}}
						title={row.status}
						type="button"
					>
						<span
							aria-label={`${row.observers} observers`}
							style={{
								background: statusColors[row.status],
								borderRadius: 4,
								color: "#ffffff",
								flexShrink: 0,
								fontWeight: 600,
								minWidth: 22,
								padding: "1px 4px",
								textAlign: "center",
							}}
						>
							{row.observers}
						</span>
						<code
							style={{
								fontFamily: monoFamily,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{row.hash}
						</code>
					</button>
				</li>
			))}
		</ul>
	);
}

function isSortBy(value: string): value is SortBy {
	return sortOrders.some((order) => order === value);
}

function Panel(props: QueryDevtoolsPanelProps) {
	const client = useDevtoolsClient(props.client);
	const palette = usePalette(props.theme);
	const rows = useQueryRows(client);
	const [filter, setFilter] = useState("");
	const [sortBy, setSortBy] = useState<SortBy>("status");
	const [selectedHash, setSelectedHash] = useState<string | undefined>(
		undefined,
	);
	const counts = countByStatus(rows);
	const shown = visibleRows(rows, filter, sortBy);
	const selected = rows.find((row) => row.hash === selectedHash);
	const control = {
		background: palette.raised,
		border: `1px solid ${palette.border}`,
		borderRadius: 4,
		color: palette.text,
		font: "inherit",
		padding: "3px 6px",
	};
	const onClose = props.onClose;
	return (
		<div
			data-raf-query-devtools=""
			style={{
				background: palette.background,
				boxSizing: "border-box",
				color: palette.text,
				colorScheme: palette === palettes.dark ? "dark" : "light",
				display: "flex",
				flexDirection: "column",
				fontFamily,
				fontSize: 12,
				lineHeight: 1.4,
				minHeight: 0,
				overflow: "hidden",
				...props.style,
			}}
		>
			<header
				style={{
					alignItems: "center",
					borderBottom: `1px solid ${palette.border}`,
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					padding: 8,
				}}
			>
				<strong style={{ fontSize: 13 }}>
					raf-query <span style={{ color: palette.accent }}>devtools</span>
				</strong>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
					{statuses.map((status) => (
						<StatusChip
							count={counts[status]}
							key={status}
							palette={palette}
							status={status}
						/>
					))}
				</div>
				<div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
					<input
						aria-label="Filter queries"
						onChange={(event) => setFilter(event.target.value)}
						placeholder="Filter"
						style={control}
						type="search"
						value={filter}
					/>
					<select
						aria-label="Sort queries"
						onChange={(event) => {
							const value = event.target.value;
							if (isSortBy(value)) {
								setSortBy(value);
							}
						}}
						style={control}
						value={sortBy}
					>
						{sortOrders.map((order) => (
							<option key={order} value={order}>
								{sortLabels[order]}
							</option>
						))}
					</select>
					<button
						onClick={() => void client.invalidate({})}
						style={{ ...control, cursor: "pointer" }}
						type="button"
					>
						Invalidate all
					</button>
					<button
						onClick={() => client.clear()}
						style={{ ...control, cursor: "pointer" }}
						type="button"
					>
						Clear cache
					</button>
					{onClose ? (
						<button
							aria-label="Close raf-query devtools"
							onClick={() => onClose()}
							style={{ ...control, cursor: "pointer" }}
							type="button"
						>
							✕
						</button>
					) : null}
				</div>
			</header>
			<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
				<nav
					aria-label="Queries"
					style={{
						borderRight: `1px solid ${palette.border}`,
						flex: 1,
						minWidth: 0,
						overflow: "auto",
					}}
				>
					<QueryList
						onSelect={setSelectedHash}
						palette={palette}
						rows={shown}
						selectedHash={selectedHash}
					/>
				</nav>
				{selected ? (
					<QueryDetails client={client} palette={palette} row={selected} />
				) : (
					<p
						style={{
							color: palette.muted,
							flex: 1,
							margin: 0,
							padding: 12,
						}}
					>
						Select a query to inspect it
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * The devtools panel on its own, to place anywhere in the page. Renders
 * nothing on the server, since the server's cache isn't the browser's.
 */
export function QueryDevtoolsPanel(props: QueryDevtoolsPanelProps) {
	const isClient = useIsClient();
	return isClient ? (
		<Panel
			client={props.client}
			onClose={props.onClose}
			style={props.style}
			theme={props.theme}
		/>
	) : null;
}

const corners = {
	"bottom-left": { bottom: 12, left: 12 },
	"bottom-right": { bottom: 12, right: 12 },
	"top-left": { left: 12, top: 12 },
	"top-right": { right: 12, top: 12 },
};

function clampSize(size: number, max: number) {
	return Math.min(Math.max(size, minSize), Math.max(max - 40, minSize));
}

function DockedDevtools(props: QueryDevtoolsProps) {
	const position = props.position ?? "bottom";
	const buttonPosition = props.buttonPosition ?? "bottom-right";
	const horizontal = position === "left" || position === "right";
	const [isOpen, setIsOpen] = useState(() => {
		const stored = readStored(storageKeys.open);
		return stored === null ? (props.initialIsOpen ?? false) : stored === "true";
	});
	const [size, setSize] = useState(
		() => Number(readStored(storageKeys.size)) || defaultSize,
	);
	const palette = usePalette(props.theme);

	const setOpen = (open: boolean) => {
		setIsOpen(open);
		writeStored(storageKeys.open, String(open));
	};

	// Listening on `window` keeps the drag going when the pointer outruns the
	// thin handle.
	const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		let latest = size;
		const onMove = (move: PointerEvent) => {
			const next = {
				bottom: window.innerHeight - move.clientY,
				left: move.clientX,
				right: window.innerWidth - move.clientX,
				top: move.clientY,
			}[position];
			latest = clampSize(
				next,
				horizontal ? window.innerWidth : window.innerHeight,
			);
			setSize(latest);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			writeStored(storageKeys.size, String(latest));
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	if (!isOpen) {
		return (
			<button
				aria-label="Open raf-query devtools"
				onClick={() => setOpen(true)}
				style={{
					...corners[buttonPosition],
					alignItems: "center",
					background: palette.background,
					border: `1px solid ${palette.border}`,
					borderRadius: 999,
					boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
					color: palette.text,
					cursor: "pointer",
					display: "flex",
					fontFamily,
					fontSize: 12,
					fontWeight: 600,
					gap: 6,
					padding: "6px 12px",
					position: "fixed",
					zIndex: 99_999,
				}}
				type="button"
			>
				<span
					aria-hidden
					style={{
						background: brandGradient,
						borderRadius: 999,
						height: 8,
						width: 8,
					}}
				/>
				raf-query
			</button>
		);
	}

	const edge = {
		bottom: { bottom: 0, height: size, left: 0, right: 0 },
		left: { bottom: 0, left: 0, top: 0, width: size },
		right: { bottom: 0, right: 0, top: 0, width: size },
		top: { height: size, left: 0, right: 0, top: 0 },
	}[position];
	const handleEdge = {
		bottom: { height: 10, left: 0, right: 0, top: -5 },
		left: { bottom: 0, right: -5, top: 0, width: 10 },
		right: { bottom: 0, left: -5, top: 0, width: 10 },
		top: { bottom: -5, height: 10, left: 0, right: 0 },
	}[position];
	return (
		<aside
			aria-label="raf-query devtools"
			style={{
				...edge,
				borderColor: palette.border,
				borderStyle: "solid",
				borderWidth: {
					bottom: "1px 0 0",
					left: "0 1px 0 0",
					right: "0 0 0 1px",
					top: "0 0 1px",
				}[position],
				boxShadow: "0 0 16px rgb(0 0 0 / 0.3)",
				position: "fixed",
				zIndex: 99_999,
			}}
		>
			<div
				aria-label="Resize raf-query devtools"
				aria-orientation={horizontal ? "vertical" : "horizontal"}
				onPointerDown={startResize}
				role="separator"
				style={{
					...handleEdge,
					alignItems: "center",
					cursor: horizontal ? "ew-resize" : "ns-resize",
					display: "flex",
					justifyContent: "center",
					position: "absolute",
					touchAction: "none",
					zIndex: 1,
				}}
			>
				<span
					aria-hidden
					style={{
						background: palette.border,
						borderRadius: 999,
						height: horizontal ? 32 : 4,
						width: horizontal ? 4 : 32,
					}}
				/>
			</div>
			<QueryDevtoolsPanel
				client={props.client}
				onClose={() => setOpen(false)}
				style={{ height: "100%", width: "100%" }}
				theme={props.theme}
			/>
		</aside>
	);
}

/**
 * A toggle button that opens the devtools panel docked to an edge of the
 * viewport. Renders nothing on the server. Open state and size are kept in
 * `localStorage`.
 */
export function QueryDevtools(props: QueryDevtoolsProps) {
	const isClient = useIsClient();
	return isClient ? (
		<DockedDevtools
			buttonPosition={props.buttonPosition}
			client={props.client}
			initialIsOpen={props.initialIsOpen}
			position={props.position}
			theme={props.theme}
		/>
	) : null;
}
