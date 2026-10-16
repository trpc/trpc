import { Button } from "@examples/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@examples/ui/components/dialog";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@examples/ui/components/tabs";
import { cn } from "@examples/ui/lib/utils";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtoolsPanel } from "@raf-query/react/devtools";
import { Expand, FlaskConical, Shrink } from "lucide-react";
import { Activity, type ReactNode, Suspense, useId, useState } from "react";

import type { DemoDefinition, DemoVariant } from "./define.ts";
import { QueriesPanel } from "./queries-panel.tsx";
import { type FakeServer, latencies } from "./server.ts";
import { DemoSessionContext } from "./session.ts";

interface Session {
	readonly client: QueryClient;
	readonly id: number;
	/** Where a reloaded browser opens. */
	readonly location?: string;
}

let sessionCount = 0;
// One live session per variant, like its fake server: React can discard a
// render and run `useState`'s initializer again, and a second client would
// send the demo's first requests twice.
const liveSessions = new WeakMap<DemoVariant, Session>();

function createSession(
	demo: DemoDefinition,
	variant: DemoVariant,
	location?: string,
): Session {
	sessionCount++;
	const session = {
		client: demo.createClient?.() ?? new QueryClient(),
		id: sessionCount,
		location,
	};
	liveSessions.set(variant, session);
	return session;
}

function sessionsFor(demo: DemoDefinition): ReadonlyArray<Session> {
	return demo.variants.map(
		(variant) => liveSessions.get(variant) ?? createSession(demo, variant),
	);
}

function DemoSkeleton() {
	return (
		<div className="grid gap-3">
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
	);
}

function Inspector(props: {
	readonly className?: string;
	readonly devtools?: boolean;
	/** The variant shown, when the demo has several. */
	readonly label?: string;
	readonly server: FakeServer<unknown>;
	readonly session: Session;
}) {
	const showing = props.label ? (
		<p className="text-xs text-muted-foreground">
			Showing{" "}
			<span className="font-mono font-medium text-foreground">
				{props.label}
			</span>
		</p>
	) : null;
	const queries = (
		<QueriesPanel
			client={props.session.client}
			key={props.session.id}
			server={props.server}
		/>
	);
	if (!props.devtools) {
		return (
			<div className={cn("grid gap-2", props.className)}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-xs font-medium">Queries</p>
					{showing}
				</div>
				<div className="min-h-28">{queries}</div>
			</div>
		);
	}
	return (
		<Tabs className={props.className} defaultValue="queries">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<TabsList className="h-8">
					<TabsTrigger className="text-xs" value="queries">
						Queries
					</TabsTrigger>
					<TabsTrigger className="text-xs" value="devtools">
						Devtools
					</TabsTrigger>
				</TabsList>
				{showing}
			</div>
			<TabsContent className="min-h-28" value="queries">
				{queries}
			</TabsContent>
			<TabsContent className="min-h-0" value="devtools">
				<QueryDevtoolsPanel
					client={props.session.client}
					style={{ borderRadius: 8, height: "100%", minHeight: 360 }}
					theme={
						document.documentElement.classList.contains("dark")
							? "dark"
							: "light"
					}
				/>
			</TabsContent>
		</Tabs>
	);
}

function VariantSwitch(props: {
	readonly demo: DemoDefinition;
	readonly onSelect: (index: number) => void;
	readonly selected: number;
}) {
	const name = useId();
	return (
		<fieldset>
			<legend className="sr-only">{props.demo.variantsLabel}</legend>
			<div className="inline-flex flex-wrap rounded-md border p-0.5">
				{props.demo.variants.map((variant, index) => (
					<label
						className={cn(
							"cursor-pointer rounded px-2.5 py-0.5 font-mono text-xs text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
							index === props.selected &&
								"bg-accent font-medium text-foreground",
						)}
						key={variant.label}
					>
						<input
							checked={index === props.selected}
							className="sr-only"
							name={name}
							onChange={() => {
								props.onSelect(index);
							}}
							type="radio"
						/>
						{variant.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}

/**
 * The selected variant, and every variant opened since the last reset kept
 * mounted in a hidden `<Activity>`, so switching back finds its page as it
 * was left.
 */
function DemoBody(props: {
	readonly demo: DemoDefinition;
	readonly onReload: (index: number, location: string) => void;
	readonly opened: ReadonlyArray<number>;
	readonly selected: number;
	readonly sessions: ReadonlyArray<Session>;
}) {
	const demo = props.demo;
	return (
		<div className="flex flex-col gap-3">
			{demo.variants.map((variant, index) => {
				const session = props.sessions[index];
				if (!session || !props.opened.includes(index)) {
					return null;
				}
				return (
					<Activity
						key={variant.label}
						mode={index === props.selected ? "visible" : "hidden"}
					>
						<QueryClientProvider client={session.client} key={session.id}>
							<DemoSessionContext
								value={{
									location: session.location,
									reload: (location) => {
										props.onReload(index, location);
									},
								}}
							>
								<Suspense fallback={<DemoSkeleton />}>
									<variant.Component />
								</Suspense>
							</DemoSessionContext>
						</QueryClientProvider>
					</Activity>
				);
			})}
		</div>
	);
}

/** Everything that changes what the demo does, with the variant's description. */
function Toolbar(props: {
	readonly demo: DemoDefinition;
	/** Shared by the frame's toolbar and the expanded dialog's. */
	readonly latency: number | undefined;
	readonly onLatency: (ms: number) => void;
	readonly onSelect: (index: number) => void;
	readonly selected: number;
}) {
	const variants = props.demo.variants;
	return (
		<div className="grid gap-1.5">
			<div className="flex flex-wrap items-center gap-2">
				{variants.length > 1 ? (
					<VariantSwitch
						demo={props.demo}
						onSelect={props.onSelect}
						selected={props.selected}
					/>
				) : null}
				<div
					aria-label="Server latency"
					className="inline-flex rounded-md border p-0.5"
					role="radiogroup"
				>
					{latencies.map((option) => (
						<button
							aria-checked={props.latency === option.ms}
							className={cn(
								"rounded px-2 py-0.5 text-xs text-muted-foreground",
								props.latency === option.ms &&
									"bg-accent font-medium text-foreground",
							)}
							key={option.ms}
							onClick={() => {
								for (const variant of props.demo.variants) {
									variant.server.latency = option.ms;
								}
								props.onLatency(option.ms);
							}}
							role="radio"
							title={`Server responds in about ${option.ms} ms`}
							type="button"
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
			{variants.length > 1 ? (
				<p aria-live="polite" className="text-sm text-muted-foreground">
					{variants[props.selected]?.description}
				</p>
			) : null}
		</div>
	);
}

/**
 * The demo with its queries underneath, or beside it when the card is wide
 * enough: inline and in the expanded dialog alike.
 */
function DemoCard(props: {
	/** Expand inline, Close in the dialog. */
	readonly action: ReactNode;
	readonly body: ReactNode;
	readonly className: string;
	readonly description: ReactNode;
	readonly devtools?: boolean;
	readonly inspected: Omit<
		Parameters<typeof Inspector>[0],
		"className" | "devtools"
	>;
	readonly title: ReactNode;
	readonly toolbar: ReactNode;
}) {
	return (
		<figure
			className={cn(
				"@container flex flex-col bg-card text-card-foreground",
				props.className,
			)}
		>
			<figcaption className="grid gap-3 border-b px-4 py-3">
				<div className="grid gap-1.5">
					<div className="flex items-center justify-between gap-3">
						{props.title}
						{props.action}
					</div>
					{props.description}
				</div>
				{props.toolbar}
			</figcaption>
			<div className="grid min-h-0 flex-1 overflow-y-auto @3xl:grid-cols-[minmax(0,1fr)_26rem] @6xl:grid-cols-[minmax(0,1fr)_32rem]">
				<div className="min-w-0 p-4">{props.body}</div>
				<Inspector
					className="min-w-0 content-start border-t bg-muted/30 px-4 py-3 @3xl:border-t-0 @3xl:border-l"
					devtools={props.devtools ?? false}
					{...props.inspected}
				/>
			</div>
		</figure>
	);
}

/**
 * A live demo in a box: its own query client and fake server, with the
 * cache's queries, each with its readers and requests. Expanding it opens
 * the same session in a dialog with the devtools panel. A demo with
 * variants gets a switch, and a session per variant. A browser's Reload
 * starts its own variant over, on the URL it was showing.
 */
export function DemoFrame(props: { readonly demo: DemoDefinition }) {
	const demo = props.demo;
	const [sessions, setSessions] = useState(() => sessionsFor(demo));
	const [selected, setSelected] = useState(0);
	const [opened, setOpened] = useState<ReadonlyArray<number>>([0]);
	const [expanded, setExpanded] = useState(false);
	const [latency, setLatency] = useState(demo.variants[0]?.server.latency);
	const variant = demo.variants[selected];
	const session = sessions[selected];
	if (!variant || !session) {
		throw new Error(`Demo "${demo.title}" has no variant ${selected}`);
	}
	const inspected = {
		label: demo.variants.length > 1 ? variant.label : undefined,
		server: variant.server,
		session,
	};
	const body = (
		<DemoBody
			demo={demo}
			onReload={(index, location) => {
				const reloaded = demo.variants[index];
				if (!reloaded) {
					return;
				}
				void sessions[index]?.client.dispose();
				reloaded.server.reset();
				setSessions((previous) =>
					previous.map((each, at) =>
						at === index ? createSession(demo, reloaded, location) : each,
					),
				);
			}}
			opened={opened}
			selected={selected}
			sessions={sessions}
		/>
	);

	const icon = (
		<FlaskConical className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
	);
	const toolbar = (
		<Toolbar
			demo={demo}
			latency={latency}
			onLatency={setLatency}
			onSelect={(index) => {
				setSelected(index);
				setOpened((previous) =>
					previous.includes(index) ? previous : [...previous, index],
				);
			}}
			selected={selected}
		/>
	);

	return (
		<>
			<DemoCard
				action={
					<Button
						onClick={() => {
							setExpanded(true);
						}}
						size="xs"
						variant="outline"
					>
						<Expand /> Expand
					</Button>
				}
				body={
					expanded ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							Running in the expanded view.
						</p>
					) : (
						body
					)
				}
				className="not-prose my-8 overflow-hidden rounded-xl border shadow-sm"
				description={
					<p className="text-xs text-muted-foreground">{demo.hint}</p>
				}
				inspected={inspected}
				title={
					<p className="flex items-center gap-2 text-sm font-semibold">
						{icon}
						{demo.title}
					</p>
				}
				toolbar={toolbar}
			/>
			<Dialog onOpenChange={setExpanded} open={expanded}>
				<DialogContent
					className="h-[min(56rem,92dvh)] w-[96vw] max-w-none gap-0 overflow-hidden p-0 sm:max-w-7xl"
					showCloseButton={false}
				>
					<DemoCard
						action={
							<Button
								onClick={() => {
									setExpanded(false);
								}}
								size="xs"
								variant="outline"
							>
								<Shrink /> Close
							</Button>
						}
						body={body}
						className="h-full min-h-0"
						description={
							<DialogDescription className="text-xs">
								{demo.hint}
							</DialogDescription>
						}
						devtools
						inspected={inspected}
						title={
							<DialogTitle className="flex items-center gap-2 text-sm">
								{icon}
								{demo.title}
							</DialogTitle>
						}
						toolbar={toolbar}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
