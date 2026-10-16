import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	allKeyed,
	type QueryHandleWithData,
	queryOptions,
	useIsFetching,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { RefreshCw } from "lucide-react";
import { startTransition } from "react";

import { DemoBrowser } from "~/demo-kit/browser.tsx";
import { Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const server = createFakeServer(() => ({ requests: 0 }));

const stats = ["orders", "signups", "tickets"] as const;
type Stat = (typeof stats)[number];

function statQuery(input: { readonly stat: Stat }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /stats/${input.stat}`,
				(db) => {
					db.requests++;
					return 40 + ((db.requests * 37 + input.stat.length * 11) % 60);
				},
				context,
			),
		queryKey: ["stats", input.stat],
		staleTime: Infinity,
	});
}

type PageData = Readonly<Record<Stat, QueryHandleWithData<typeof statQuery>>>;

function GlobalIndicator() {
	const fetching = useIsFetching();
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
				<div
					className={cn(
						"absolute inset-y-0 left-0 w-1/3 rounded-full bg-sky-500 transition-opacity",
						fetching > 0
							? "animate-[indeterminate_1s_ease-in-out_infinite] opacity-100"
							: "opacity-0",
					)}
				/>
			</div>
			<span className="w-36 text-right font-mono tabular-nums">
				useIsFetching() = {fetching}
			</span>
		</div>
	);
}

function StatCard(props: {
	readonly handle: QueryHandleWithData<typeof statQuery>;
	readonly stat: Stat;
}) {
	const [value, stat] = useQuery(statQuery, props.handle);
	return (
		<section
			aria-busy={stat.isFetching}
			className="grid gap-1 rounded-lg border p-3"
		>
			<h4 className="flex items-center justify-between text-xs text-muted-foreground capitalize">
				{props.stat}
				{stat.isFetching ? <Spinner /> : null}
			</h4>
			<p className="text-2xl font-semibold tabular-nums">{value}</p>
			<Button
				className="justify-self-start"
				disabled={stat.isFetching}
				onClick={() => {
					startTransition(async () => {
						await stat.refetch();
					});
				}}
				size="xs"
				variant="ghost"
			>
				<RefreshCw /> Refetch
			</Button>
		</section>
	);
}

function Dashboard(props: { readonly data: PageData }) {
	const qc = useQueryClient();
	return (
		<div className="grid gap-3">
			<GlobalIndicator />
			<div className="grid gap-2 sm:grid-cols-3">
				{stats.map((stat) => (
					<StatCard handle={props.data[stat]} key={stat} stat={stat} />
				))}
			</div>
			<Button
				className="justify-self-start"
				onClick={() => {
					startTransition(async () => {
						await qc.invalidate({ queryKey: ["stats"] });
					});
				}}
				size="sm"
				variant="outline"
			>
				<RefreshCw /> Invalidate all stats
			</Button>
		</div>
	);
}

function FetchingIndicators() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-36 w-full" />}
			initial={{ path: "/dashboard" }}
			loader={(args): Promise<PageData> =>
				allKeyed({
					orders: args.client.ensure(statQuery, { stat: "orders" }),
					signups: args.client.ensure(statQuery, { stat: "signups" }),
					tickets: args.client.ensure(statQuery, { stat: "tickets" }),
				})
			}
		>
			{(route) => <Dashboard data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: FetchingIndicators,
	hint: "Each card shows its own isFetching. The optional bar uses useIsFetching for a global count — prefer the router's pending UI for navigations. Refetch one card, or invalidate them all.",
	server,
	title: "isFetching and useIsFetching",
});
