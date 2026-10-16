import { cn } from "@examples/ui/lib/utils";
import { type QueryClient, useQueryClient } from "@raf-query/react";
import { ArrowLeft, Lock, RotateCw } from "lucide-react";
import {
	createContext,
	type ReactNode,
	Suspense,
	use,
	useState,
	useTransition,
} from "react";

export interface DemoLocation {
	readonly path: string;
	readonly search?: Readonly<Record<string, number | string>>;
}

function href(location: DemoLocation) {
	const search = new URLSearchParams(
		Object.entries(location.search ?? {}).map(([key, value]) => [
			key,
			String(value),
		]),
	).toString();
	return search ? `${location.path}?${search}` : location.path;
}

export type DemoLoader<TData> = (args: {
	readonly client: QueryClient<unknown>;
	readonly location: DemoLocation;
}) => TData | Promise<TData>;

interface Entry<TData> {
	readonly data: TData | Promise<TData>;
	readonly location: DemoLocation;
}

interface Navigation {
	readonly location: DemoLocation;
	navigate(to: DemoLocation): void;
	preload(to: DemoLocation): void;
}

const NavigationContext = createContext<Navigation | null>(null);

function useNavigation() {
	const navigation = use(NavigationContext);
	if (!navigation) {
		throw new Error("DemoLink: render it inside a DemoBrowser");
	}
	return navigation;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
	return typeof value === "object" && value !== null && "then" in value;
}

/**
 * A tiny router in a browser window. Like TanStack Router and Next.js, it
 * runs the route's loader on every navigation and commits the new page in a
 * transition, so a suspending page keeps the previous one on screen.
 */
export function DemoBrowser<TData>(props: {
	readonly children: (route: {
		readonly data: TData;
		readonly location: DemoLocation;
	}) => ReactNode;
	readonly fallback: ReactNode;
	readonly initial: DemoLocation;
	readonly loader: DemoLoader<TData>;
}) {
	const client = useQueryClient();
	const loader = props.loader;
	const [history, setHistory] = useState<ReadonlyArray<Entry<TData>>>(() => [
		{
			data: loader({ client, location: props.initial }),
			location: props.initial,
		},
	]);
	const [isNavigating, startTransition] = useTransition();
	const current = history.at(-1) ?? {
		data: loader({ client, location: props.initial }),
		location: props.initial,
	};

	const go = (location: DemoLocation, keep: number) => {
		startTransition(async () => {
			const data = await loader({ client, location });
			startTransition(() => {
				setHistory((previous) => [
					...previous.slice(0, keep),
					{ data, location },
				]);
			});
		});
	};

	const navigation: Navigation = {
		location: current.location,
		navigate: (to) => {
			go(to, history.length);
		},
		preload: (to) => {
			void loader({ client, location: to });
		},
	};
	const previous = history.at(-2);

	return (
		<BrowserWindow
			canGoBack={previous !== undefined}
			href={href(current.location)}
			isNavigating={isNavigating}
			onBack={() => {
				if (previous) {
					go(previous.location, history.length - 2);
				}
			}}
			onReload={() => {
				go(current.location, history.length - 1);
			}}
		>
			<NavigationContext value={navigation}>
				<Suspense fallback={props.fallback}>
					<RouteView entry={current}>{props.children}</RouteView>
				</Suspense>
			</NavigationContext>
		</BrowserWindow>
	);
}

/** A browser window's chrome: back, reload, the address bar and a progress bar. */
export function BrowserWindow(props: {
	readonly canGoBack: boolean;
	readonly children: ReactNode;
	readonly href: string;
	readonly isNavigating: boolean;
	readonly onBack: () => void;
	readonly onReload: () => void;
}) {
	return (
		<div className="overflow-hidden rounded-lg border bg-background shadow-xs">
			<div className="relative flex items-center gap-1.5 border-b bg-muted/50 px-2 py-1.5">
				<button
					aria-label="Back"
					className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
					disabled={!props.canGoBack}
					onClick={props.onBack}
					title="Back"
					type="button"
				>
					<ArrowLeft className="size-4" />
				</button>
				<button
					aria-label="Reload"
					className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
					onClick={props.onReload}
					title="Reload"
					type="button"
				>
					<RotateCw
						className={cn("size-3.5", props.isNavigating && "animate-spin")}
					/>
				</button>
				<div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 font-mono text-xs">
					<Lock className="size-3 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">app.example</span>
					<span className="truncate">{props.href}</span>
				</div>
				<div
					aria-hidden="true"
					className={cn(
						"absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-transform",
						props.isNavigating
							? "scale-x-75 duration-[2000ms] ease-out"
							: "scale-x-0 duration-0",
					)}
				/>
			</div>
			<div className="p-4">{props.children}</div>
		</div>
	);
}

function RouteView<TData>(props: {
	readonly children: (route: {
		readonly data: TData;
		readonly location: DemoLocation;
	}) => ReactNode;
	readonly entry: Entry<TData>;
}) {
	const data = isPromise(props.entry.data)
		? use(props.entry.data)
		: props.entry.data;
	return props.children({ data, location: props.entry.location });
}

/** A link inside a {@link DemoBrowser}. `preload` runs the loader on hover, as `defaultPreload: "intent"` does. */
export function DemoLink(props: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly preload?: boolean;
	readonly to: DemoLocation;
}) {
	const navigation = useNavigation();
	const active = href(navigation.location) === href(props.to);
	return (
		<a
			aria-current={active ? "page" : undefined}
			className={props.className}
			href={href(props.to)}
			onClick={(event) => {
				event.preventDefault();
				navigation.navigate(props.to);
			}}
			onFocus={() => {
				if (props.preload) {
					navigation.preload(props.to);
				}
			}}
			onPointerEnter={() => {
				if (props.preload) {
					navigation.preload(props.to);
				}
			}}
		>
			{props.children}
		</a>
	);
}
