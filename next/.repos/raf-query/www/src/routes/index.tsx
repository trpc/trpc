import { Badge } from "@examples/ui/components/badge";
import { buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import {
	ArrowRight,
	Cable,
	FileCode2,
	Link2,
	Radio,
	Send,
	Server,
	Sparkles,
	SquareStack,
} from "lucide-react";
import type { ReactNode } from "react";

import homeCommentsHeroNext from "sample:nextjs/src/app/(blog)/components/comments.tsx#hero";
import homeCommentsNext from "sample:nextjs/src/app/(blog)/components/comments.tsx#component";
import homePostNext from "sample:nextjs/src/app/(blog)/components/post.tsx#component";
import homeLoaderNext from "sample:nextjs/src/app/(blog)/posts/[slug]/page.tsx#page";
import homeFactoriesNext from "sample:nextjs/src/queries.ts#home";
import homeRouter from "sample:react-router/app/routes/blog.$slug.tsx#hero";
import homeComponentRouter from "sample:react-router/app/routes/blog.$slug.tsx#component";
import homeLoaderRouter from "sample:react-router/app/routes/blog.$slug.tsx#loader";
import homeFactoriesRouter from "sample:react-router/app/queries.ts#home";
import home from "sample:tanstack-start/src/routes/blog.$slug.tsx#hero";
import homeFactories from "sample:tanstack-start/src/queries.ts#home";
import homeComponent from "sample:tanstack-start/src/routes/blog.$slug.tsx#component";
import homeLoader from "sample:tanstack-start/src/routes/blog.$slug.tsx#route";
import { DocBody } from "~/components/doc-body.tsx";
import { DemoEmbed } from "~/components/demo-embed.tsx";
import { FrameworkModeBar } from "~/components/framework-mode-bar.tsx";
import type { DocSegment } from "~/content/types.ts";
import { firstDoc } from "~/content/docs.ts";
import { demoQuery } from "~/demos/registry.ts";
import {
	defaultFrameworkMode,
	type FrameworkMode,
	frameworkModes,
	homeSearchDefaults,
	homeSearchSchema,
	syncFrameworkModeAttribute,
} from "~/framework-mode.ts";
import { pageHead } from "~/seo.ts";
import { site } from "~/site.ts";

export const Route = createFileRoute("/")({
	validateSearch: homeSearchSchema,
	search: {
		middlewares: [stripSearchParams(homeSearchDefaults)],
	},
	loader: (args) => ({
		demo: args.context.queryClient.prefetch(demoQuery, {
			id: "starting-queries",
		}),
	}),
	head: () =>
		pageHead({
			description: site.description,
			markdownPath: "/llms.txt",
			path: "/",
			structuredData: [
				{
					"@type": "WebSite",
					description: site.description,
					name: site.name,
					url: site.url,
				},
				{
					"@type": "SoftwareSourceCode",
					codeRepository: site.github,
					description: site.description,
					license: "https://opensource.org/licenses/MIT",
					name: site.name,
					programmingLanguage: ["TypeScript", "React"],
					runtimePlatform: "Node.js, browsers",
					url: site.url,
				},
			],
		}),
	component: HomePage,
});

const features: ReadonlyArray<{
	readonly body: ReactNode;
	readonly icon: ReactNode;
	readonly slug: string;
	readonly title: string;
}> = [
	{
		body: "Route loaders and server components start every query a page needs, in parallel, before anything renders.",
		icon: <Send />,
		slug: "starting-queries",
		title: "Fetch where React recommends",
	},
	{
		body: "A handle is a key and an input, plus the data once ensure or fetch has loaded it. It crosses the loader, the server and the client.",
		icon: <Link2 />,
		slug: "handles",
		title: "Small, serializable handles",
	},
	{
		body: "useQuery returns a stable promise; unwrap it with use() wherever the data is needed, even in a child.",
		icon: <SquareStack />,
		slug: "reading-queries",
		title: "Promises in, use() out",
	},
	{
		body: "Filters, sort and pages live in the URL. whilePending picks between suspending and keeping the previous page.",
		icon: <Radio />,
		slug: "url-state-and-pagination",
		title: "The URL is the input",
	},
	{
		body: "No useMutation: write in form actions, then invalidate. React's useOptimistic and useActionState do the rest.",
		icon: <Cable />,
		slug: "mutations",
		title: "Actions for writes",
	},
	{
		body: "The server's cache streams to the browser as queries settle, in TanStack Start, React Router and Next.js App Router.",
		icon: <Server />,
		slug: "ssr-and-hydration",
		title: "Streaming SSR and RSC",
	},
];

/** The heading's text, linking to its own id. */
function HashLink(props: {
	readonly children: ReactNode;
	readonly id: string;
}) {
	return (
		<a className="heading-anchor" href={`#${props.id}`}>
			{props.children}
		</a>
	);
}

const docLink = "font-medium text-foreground underline underline-offset-4";

const heroByMode = {
	nextjs: [
		...homeLoaderNext.segments,
		...homePostNext.segments,
		...homeCommentsHeroNext.segments,
	],
	// Start and React Router keep loader + components in one file; Next.js
	// splits the server page from the client components it renders.
	"react-router": homeRouter.segments,
	"tanstack-start": home.segments,
} as const satisfies Record<FrameworkMode, ReadonlyArray<DocSegment>>;

const factoryStep = {
	guide: "Query factories",
	id: "define-query-factories",
	slug: "query-factories",
	title: "Define query factories",
} as const;

/** Step 1's prose; only TanStack Start's server function differs by mode. */
const factoryStepBody = (modeNote?: ReactNode) => (
	<>
		<p>
			A query factory is a function of the query’s input that returns{" "}
			<code>queryOptions</code>, as in TanStack Query: a key, a{" "}
			<code>queryFn</code>, and options like <code>staleTime</code>. Comments
			load a page at a time, so <code>commentsQuery</code> uses{" "}
			<code>infiniteQueryOptions</code>.
		</p>
		{modeNote}
		<p>
			Every API takes the factory and its input instead of a key: starting a
			query, reading it, invalidating it. The key and the request are written
			once, and the data’s type flows from <code>queryFn</code> to the component
			that reads it.
		</p>
		<p>
			The input has to be serializable: it’s what a handle carries from the
			server to the browser.
		</p>
	</>
);

const stepsByMode = {
	nextjs: [
		{
			...factoryStep,
			body: factoryStepBody(),
			code: homeFactoriesNext.segments,
		},
		{
			body: (
				<>
					<p>
						A server component runs as soon as the App Router starts rendering
						the page. Every query the page needs starts there, at the same time,
						before client components render.
					</p>
					<p>
						<code>prefetch</code> never holds the response: the page streams
						while the post and comments load. Each call returns a{" "}
						<strong className="text-foreground">handle</strong> — the query’s
						key and input, without the data. <code>HydrationBoundary</code>{" "}
						streams the cache to the browser next to those handles, so nothing
						is fetched twice.
					</p>
					<p>
						Use <code>fetch</code> when the server component itself renders the
						data. Prefer <code>prefetch</code> when a client component will read
						it under Suspense — the usual App Router shape, and what the example
						app does.
					</p>
				</>
			),
			code: homeLoaderNext.segments,
			guide: "Starting queries",
			id: "start-in-the-loader",
			slug: "starting-queries",
			title: "Start them in a server component",
		},
		{
			body: (
				<>
					<p>
						Client components live in their own files, marked with a{" "}
						<code>use client</code> directive. <code>useQuery</code> takes the
						factory and a handle and returns a promise. <code>use()</code>{" "}
						suspends that subtree while its skeleton shows, so the rest of the
						page can stream in around it.
					</p>
					<p>
						From then on the cache keeps both up to date: it refetches stale
						data when the window regains focus and after a write invalidates it,
						and each component re-renders with the new data.
					</p>
				</>
			),
			code: [...homePostNext.segments, ...homeCommentsNext.segments],
			guide: "Reading queries",
			id: "read-in-components",
			slug: "reading-queries",
			title: "Read them in client components",
		},
	],
	"react-router": [
		{
			...factoryStep,
			body: factoryStepBody(),
			code: homeFactoriesRouter.segments,
		},
		{
			body: (
				<>
					<p>
						React Router runs the loader on the server as soon as a navigation
						starts. Every query the page needs starts there, at the same time,
						before anything renders. A root middleware creates one client per
						request, and every loader reads it from the context: nested routes
						share a cache, and requests never share data.
					</p>
					<p>
						<code>prefetch</code> never holds the navigation: the page renders
						while the post and comments load. Each call returns a{" "}
						<strong className="text-foreground">handle</strong> — the query’s
						key and input, without the data. The loader returns the handles with{" "}
						<code>dehydrate(qc)</code>, and React Router streams the queries
						still loading to the browser, so nothing is fetched twice.
					</p>
					<p>
						Use <code>fetch</code> when the route can’t lay out without the
						data. Prefer <code>prefetch</code> when a component will read it
						under Suspense — the usual shape, and what the example app does for
						streamed parts of the page.
					</p>
				</>
			),
			code: homeLoaderRouter.segments,
			guide: "React Router",
			id: "start-in-the-loader",
			slug: "react-router",
			title: "Start them in the route loader",
		},
		{
			body: (
				<>
					<p>
						The route component wraps the page in <code>HydrationBoundary</code>
						, which writes the loader’s snapshot into the browser’s cache.{" "}
						<code>useQuery</code> takes the factory and a handle and returns a
						promise. <code>use()</code> suspends that subtree while its skeleton
						shows, so the rest of the page can stream in around it.
					</p>
					<p>
						From then on the cache keeps both up to date: it refetches stale
						data when the window regains focus and after a write invalidates it,
						and each component re-renders with the new data.
					</p>
				</>
			),
			code: homeComponentRouter.segments,
			guide: "Reading queries",
			id: "read-in-components",
			slug: "reading-queries",
			title: "Read them in components",
		},
	],
	"tanstack-start": [
		{
			...factoryStep,
			body: factoryStepBody(
				<p>
					<code>getPost</code> is a server function: during SSR it runs in the
					process, and refetches in the browser call it over HTTP.
				</p>,
			),
			code: homeFactories.segments,
		},
		{
			body: (
				<>
					<p>
						The router runs the loader as soon as a navigation starts, and with
						preloading on, when a link is hovered. Every query the page needs
						starts there, at the same time, before anything renders.
					</p>
					<p>
						<code>prefetch</code> never holds the navigation: the page renders
						while the post and comments load. Each call returns a{" "}
						<strong className="text-foreground">handle</strong> — the query’s
						key and input, without the data. During SSR, the cache streams to
						the browser next to those handles, so nothing is fetched twice.
					</p>
					<p>
						Use <code>ensure</code> when the route can’t lay out without the
						data. Prefer <code>prefetch</code> when a component will read it
						under Suspense — the usual shape, and what the example app does for
						streamed parts of the page.
					</p>
				</>
			),
			code: homeLoader.segments,
			guide: "Starting queries",
			id: "start-in-the-loader",
			slug: "starting-queries",
			title: "Start them in the route loader",
		},
		{
			body: (
				<>
					<p>
						<code>useQuery</code> takes the factory and a handle and returns a
						promise. <code>use()</code> suspends that subtree while its skeleton
						shows, so the rest of the page can stream in around it.
					</p>
					<p>
						From then on the cache keeps both up to date: it refetches stale
						data when the window regains focus and after a write invalidates it,
						and each component re-renders with the new data.
					</p>
				</>
			),
			code: homeComponent.segments,
			guide: "Reading queries",
			id: "read-in-components",
			slug: "reading-queries",
			title: "Read them in components",
		},
	],
} as const satisfies Record<
	FrameworkMode,
	ReadonlyArray<{
		readonly body: ReactNode;
		readonly code: ReadonlyArray<DocSegment>;
		readonly guide: string;
		readonly id: string;
		readonly slug: string;
		readonly title: string;
	}>
>;

const howItWorksByMode = {
	nextjs: (
		<>
			A page says what it needs before it renders. Each query is defined once,
			the server component starts every request when the route renders, and
			client components read the results as they arrive.
		</>
	),
	"react-router": (
		<>
			A page says what it needs before it renders. Each query is defined once,
			the route’s loader starts every request when the navigation begins, and
			components read the results as they arrive.
		</>
	),
	"tanstack-start": (
		<>
			A page says what it needs before it renders. Each query is defined once,
			the route starts every request when the navigation begins, and components
			read the results as they arrive.
		</>
	),
} as const satisfies Record<FrameworkMode, ReactNode>;

const mapping: ReadonlyArray<readonly [string, string]> = [
	["queryClient.prefetchQuery()", "qc.prefetch(factory, input)"],
	["queryClient.ensureQueryData()", "qc.ensure(factory, input)"],
	["queryClient.fetchQuery()", "qc.fetch(factory, input)"],
	["useSuspenseQuery()", "use(useQuery(factory, handle)[0])"],
	["useInfiniteQuery()", "useQuery() with an infiniteQueryOptions factory"],
	["placeholderData: keepPreviousData", 'whilePending: "previous"'],
	["useMutation()", "Actions + qc.invalidate()"],
	["invalidateQueries(filters)", "qc.invalidate(filter)"],
];

/** Homepage excerpts; the full list is /docs/comparison#what-we-leave-out. */
const leaveOuts: ReadonlyArray<{
	readonly feature: string;
	readonly why: string;
}> = [
	{
		feature: "useMutation",
		why: "Actions, useOptimistic and useActionState already cover pending, optimistic and error state.",
	},
	{
		feature: "enabled / select / placeholderData",
		why: "The route owns the input; shape data in the queryFn or the component; whilePending keeps the previous page.",
	},
	{
		feature: "refetchOnMount",
		why: "Mounting a reader never fetches. Loaders re-run on navigation.",
	},
	{
		feature: "Render-starting useQuery",
		why: "Only useWaterfall may start a request in render — waterfalls stay explicit.",
	},
	{
		feature: "Persistence and other frameworks",
		why: "A React + Suspense experiment, not a multi-framework ecosystem.",
	},
];

function HomePage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	// Client navigations (and hydration) — first paint uses frameworkModeScript.
	syncFrameworkModeAttribute(search.mode);
	return (
		<>
			<main>
				<section className="relative border-b">
					{/* Overflow lives on the wash only — sticky on the left column
					    needs a visible overflow ancestor. */}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 overflow-hidden [background-image:radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
					/>
					<div className="relative mx-auto grid max-w-7xl items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-24">
						<div className="grid gap-6 lg:sticky lg:top-36">
							<Badge className="w-fit" variant="outline">
								<Sparkles /> Early · 0.x on npm
							</Badge>
							<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
								Render-as-you-fetch data fetching for React
							</h1>
							<p className="max-w-xl text-lg text-pretty text-muted-foreground">
								Queries start in route loaders and React Server Components,
								travel to components as small serializable{" "}
								<strong className="text-foreground">handles</strong>, and are
								read with React’s{" "}
								<code className="font-mono text-base">use()</code> under
								Suspense. The cache works like{" "}
								<a
									className="font-medium text-foreground underline underline-offset-4"
									href="https://tanstack.com/query"
								>
									TanStack Query
								</a>
								’s.
							</p>
							<div className="flex flex-wrap gap-3">
								<Link
									className={cn(buttonVariants({ size: "lg" }))}
									params={{ slug: "quick-start" }}
									to="/docs/$slug"
								>
									Get started <ArrowRight />
								</Link>
								<Link
									className={cn(
										buttonVariants({ size: "lg", variant: "outline" }),
									)}
									params={{ slug: firstDoc }}
									to="/docs/$slug"
								>
									Read the overview
								</Link>
							</div>
							<p className="font-mono text-sm text-muted-foreground">
								<span className="select-none">$ </span>pnpm add @raf-query/react
								effect
							</p>
						</div>
						{/* pt-14 is the room the framework pill docks in, above the code.
						    Every mode ships in the HTML; CSS + frameworkModeScript pick. */}
						<div
							className="relative min-w-0 pt-14 [&_.code-block:first-child]:mt-0"
							id="hero-code"
						>
							<FrameworkModeBar mode={search.mode} />
							{frameworkModes.map((mode) => (
								<div data-framework-panel={mode} key={mode}>
									<DocBody demos={{}} segments={heroByMode[mode]} />
								</div>
							))}
						</div>
					</div>
				</section>

				<section
					aria-labelledby="how-it-works"
					className="mx-auto max-w-7xl border-b px-4 py-16 sm:px-6"
				>
					<h2
						className="mb-2 scroll-mt-32 text-2xl font-semibold tracking-tight"
						id="how-it-works"
					>
						<HashLink id="how-it-works">How a route loads its data</HashLink>
					</h2>
					{/* Every mode in static HTML. Shared step ids are applied to the
					    visible panel only by frameworkModeScript / applyFrameworkMode. */}
					{frameworkModes.map((mode) => (
						<div data-framework-panel={mode} key={mode}>
							<p className="mb-12 max-w-2xl text-muted-foreground [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground">
								{howItWorksByMode[mode]}
							</p>
							<ol className="grid gap-16">
								{stepsByMode[mode].map((step, index) => (
									<li
										className="grid scroll-mt-32 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12"
										data-step-id={step.id}
										id={mode === defaultFrameworkMode ? step.id : undefined}
										key={step.id}
									>
										<div className="grid content-start gap-4 lg:sticky lg:top-36">
											<h3 className="flex items-center gap-3 text-xl font-semibold tracking-tight">
												<span
													aria-hidden="true"
													className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground"
												>
													{index + 1}
												</span>
												<HashLink id={step.id}>{step.title}</HashLink>
											</h3>
											<div className="grid gap-3 text-muted-foreground [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground">
												{step.body}
											</div>
											<Link
												className={`${docLink} w-fit text-sm`}
												params={{ slug: step.slug }}
												to="/docs/$slug"
											>
												{step.guide} <ArrowRight className="inline size-4" />
											</Link>
										</div>
										<div className="min-w-0 [&_.code-block]:my-0!">
											<DocBody demos={{}} segments={step.code} />
										</div>
									</li>
								))}
							</ol>
						</div>
					))}
				</section>

				<section
					aria-labelledby="principles"
					className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
				>
					<h2
						className="mb-2 scroll-mt-32 text-2xl font-semibold tracking-tight"
						id="principles"
					>
						<HashLink id="principles">
							Built around how React wants data
						</HashLink>
					</h2>
					<p className="mb-8 max-w-2xl text-muted-foreground">
						Fetch-on-render is an explicitly named escape hatch, not the
						default. Every page starts its queries before it renders.
					</p>
					<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((feature) => (
							<li key={feature.slug}>
								<Link
									className="grid h-full gap-2 rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50 [&_svg]:size-5"
									params={{ slug: feature.slug }}
									to="/docs/$slug"
								>
									<span className="text-muted-foreground">{feature.icon}</span>
									<span className="font-semibold">{feature.title}</span>
									<span className="text-sm text-muted-foreground">
										{feature.body}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>

				<section
					aria-labelledby="try-it"
					className="border-y bg-muted/30 py-16"
				>
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<h2
							className="mb-2 scroll-mt-32 text-2xl font-semibold tracking-tight"
							id="try-it"
						>
							<HashLink id="try-it">Try it: prefetch, ensure or fetch</HashLink>
						</h2>
						<p className="max-w-2xl text-muted-foreground">
							The demo runs in your browser against a fake server, with its
							queries, their requests and the cache shown next to it.
						</p>
						<DemoEmbed handle={data.demo} />
					</div>
				</section>

				<section
					aria-labelledby="tanstack"
					className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2"
				>
					<div className="grid content-start gap-4">
						<h2
							className="scroll-mt-32 text-2xl font-semibold tracking-tight"
							id="tanstack"
						>
							<HashLink id="tanstack">
								Standing on TanStack Query’s shoulders
							</HashLink>
						</h2>
						<p className="text-muted-foreground">
							The cache’s mechanics follow{" "}
							<a
								className="font-medium text-foreground underline underline-offset-4"
								href="https://tanstack.com/query"
							>
								TanStack Query
							</a>{" "}
							closely: query keys, deduping, staleness, garbage collection,
							retries, structural sharing, infinite pages, focus and reconnect
							refetching. If you know TanStack Query, you already know how
							raf-query caches. What changes is where queries start and how
							components read them.
						</p>
						<div className="flex flex-wrap gap-3">
							<Link
								className={cn(buttonVariants({ variant: "outline" }))}
								hash="what-we-leave-out"
								params={{ slug: "comparison" }}
								to="/docs/$slug"
							>
								<FileCode2 /> What we leave out
							</Link>
							<Link
								className={cn(buttonVariants({ variant: "ghost" }))}
								params={{ slug: "comparison" }}
								to="/docs/$slug"
							>
								Full comparison
							</Link>
							<Link
								className={cn(buttonVariants({ variant: "ghost" }))}
								params={{ slug: "credits" }}
								to="/docs/$slug"
							>
								Credits
							</Link>
						</div>
					</div>
					<div className="overflow-x-auto rounded-xl border">
						<table className="w-full text-sm">
							<thead className="bg-muted/50 text-left">
								<tr>
									<th className="px-4 py-2 font-medium">TanStack Query</th>
									<th className="px-4 py-2 font-medium">raf-query</th>
								</tr>
							</thead>
							<tbody>
								{mapping.map(([from, to]) => (
									<tr className="border-t" key={from}>
										<td className="px-4 py-2 font-mono text-xs text-muted-foreground">
											{from}
										</td>
										<td className="px-4 py-2 font-mono text-xs">{to}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="grid gap-4 lg:col-span-2">
						<h3
							className="scroll-mt-32 text-lg font-semibold tracking-tight"
							id="leave-out"
						>
							<HashLink id="leave-out">What we leave out</HashLink>
						</h3>
						<p className="max-w-3xl text-muted-foreground">
							TanStack Query is mature and broad. raf-query is narrower: the
							same cache ideas, shaped so queries start in loaders and RSC.
							These are deliberate gaps, not unfinished ports.
						</p>
						<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{leaveOuts.map((item) => (
								<li className="grid gap-1" key={item.feature}>
									<code className="font-mono text-sm text-foreground">
										{item.feature}
									</code>
									<span className="text-sm text-muted-foreground">
										{item.why}
									</span>
								</li>
							))}
						</ul>
						<p>
							<Link
								className={`${docLink} w-fit text-sm`}
								hash="what-we-leave-out"
								params={{ slug: "comparison" }}
								to="/docs/$slug"
							>
								Everything we leave out, and why{" "}
								<ArrowRight className="inline size-4" />
							</Link>
						</p>
					</div>
				</section>
			</main>
		</>
	);
}
