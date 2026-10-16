import { Skeleton } from "@examples/ui/components/skeleton";
import {
	allKeyed,
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import {
	createRootRouteWithContext,
	createRoute,
	Link,
	type LinkComponentProps,
	type Router,
} from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { type ReactNode, Suspense, use, useId } from "react";

import { defineDemo } from "~/demo-kit/define.ts";
import {
	type Comment,
	type Post,
	seedComments,
	seedPosts,
} from "~/demo-kit/fixtures.ts";
import { DemoRouter } from "~/demo-kit/router.tsx";
import { createFakeServer } from "~/demo-kit/server.ts";

/**
 * A blog's server and the factories that query it. Each variant gets its
 * own, so its Queries panel shows only its requests.
 */
function createBlog() {
	const server = createFakeServer(() => ({
		comments: seedComments(),
		posts: seedPosts(),
	}));
	return {
		commentsQuery: (input: { postId: number }) =>
			infiniteQueryOptions({
				getNextPageParam: commentNext,
				initialPageParam: 0,
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.postId}/comments`,
						(db): CommentPage => ({
							items: db.comments.filter(
								(comment) => comment.postId === input.postId,
							),
							nextCursor: null,
						}),
						context,
					),
				queryKey: ["posts", input.postId, "comments"],
				staleTime: 5000,
			}),
		postQuery: (input: { id: number }) =>
			queryOptions({
				queryFn: (context) =>
					server.respond(
						`GET /posts/${input.id}`,
						(db) => db.posts.find((post) => post.id === input.id),
						context,
					),
				queryKey: ["posts", input.id],
				staleTime: 5000,
			}),
		postsQuery: () =>
			infiniteQueryOptions({
				getNextPageParam: postNext,
				initialPageParam: 0,
				queryFn: (context) =>
					server.respond(
						"GET /posts",
						(db) => ({
							items: db.posts
								.slice(0, 4)
								.map((post) => ({ id: post.id, title: post.title })),
							nextCursor: null,
						}),
						context,
					),
				queryKey: ["posts"],
				staleTime: 5000,
			}),
		server,
	};
}

interface CommentPage {
	readonly items: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
}

interface PostListPage {
	readonly items: ReadonlyArray<PostSummary>;
	readonly nextCursor: number | null;
}

function commentNext(lastPage: CommentPage) {
	return lastPage.nextCursor;
}

function postNext(lastPage: PostListPage) {
	return lastPage.nextCursor;
}

interface RouterContext {
	readonly queryClient: QueryClient;
}

// The docs site registers its own router, so the hooks and links below name
// the demo's. Every variant's routes have the same paths.
type PrefetchRouter = Router<typeof prefetchTree>;
type EnsureRouter = Router<typeof ensureTree>;
type FetchRouter = Router<typeof fetchTree>;

function BlogLink<const TTo extends string>(
	props: LinkComponentProps<"a", PrefetchRouter, string, TTo, string, "">,
) {
	return <Link<PrefetchRouter, string, TTo> {...props} />;
}

function PostSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-6 w-2/3" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

function PostBody(props: { readonly post: Post | undefined }) {
	return (
		<article className="grid gap-1">
			<h3 className="text-lg font-semibold">{props.post?.title}</h3>
			<p className="text-sm text-muted-foreground">{props.post?.body}</p>
		</article>
	);
}

function CommentsSection(props: { readonly children: ReactNode }) {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="grid gap-2 border-t pt-3">
			<h4
				className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
				id={headingId}
			>
				<MessageSquare className="size-3.5" /> Comments
			</h4>
			{props.children}
		</section>
	);
}

function CommentsSkeleton() {
	return (
		<div className="grid gap-3">
			{[0, 1].map((row) => (
				<div className="flex gap-2.5" key={row}>
					<Skeleton className="size-7 shrink-0 rounded-full" />
					<div className="grid flex-1 gap-1.5">
						<Skeleton className="h-3.5 w-16" />
						<Skeleton className="h-3.5 w-3/4" />
					</div>
				</div>
			))}
		</div>
	);
}

function commentItems(data: { readonly pages: ReadonlyArray<CommentPage> }) {
	return data.pages.flatMap((page) => page.items);
}

function CommentList(props: { readonly comments: ReadonlyArray<Comment> }) {
	return (
		<ul className="grid gap-3">
			{props.comments.map((comment) => (
				<li className="flex gap-2.5 text-sm" key={comment.id}>
					<span
						aria-hidden="true"
						className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
					>
						{comment.author.charAt(0)}
					</span>
					<div className="grid gap-0.5">
						<span className="font-medium">{comment.author}</span>
						<p className="text-muted-foreground">{comment.body}</p>
					</div>
				</li>
			))}
		</ul>
	);
}

type PostSummary = Pick<Post, "id" | "title">;

function PostList(props: { readonly posts: ReadonlyArray<PostSummary> }) {
	return (
		<ul className="grid gap-1">
			{props.posts.map((post) => (
				<li key={post.id}>
					<BlogLink
						className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
						params={{ id: String(post.id) }}
						to="/posts/$id"
					>
						{post.title}
					</BlogLink>
				</li>
			))}
		</ul>
	);
}

function PostListSkeleton() {
	return (
		<div className="grid gap-1">
			{[0, 1, 2, 3].map((row) => (
				<Skeleton className="h-8 w-full" key={row} />
			))}
		</div>
	);
}

function PostPage(props: { readonly children: ReactNode }) {
	return (
		<div className="grid gap-4">
			<BlogLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to="/posts"
			>
				← All posts
			</BlogLink>
			{props.children}
		</div>
	);
}

const prefetching = createBlog();
const prefetchRoot = createRootRouteWithContext<RouterContext>()();
const prefetchPost = createRoute({
	component: PrefetchedPost,
	getParentRoute: () => prefetchRoot,
	loader: (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.id);
		return {
			comments: qc.prefetch(prefetching.commentsQuery, { postId: id }),
			post: qc.prefetch(prefetching.postQuery, { id }),
		};
	},
	path: "/posts/$id",
});
const prefetchList = createRoute({
	component: PrefetchedList,
	getParentRoute: () => prefetchRoot,
	loader: (args) => args.context.queryClient.prefetch(prefetching.postsQuery),
	path: "/posts",
});
const prefetchTree = prefetchRoot.addChildren([prefetchList, prefetchPost]);

function PromisedList(props: {
	readonly posts: Promise<{
		readonly pages: ReadonlyArray<{
			readonly items: ReadonlyArray<PostSummary>;
		}>;
	}>;
}) {
	const pages = use(props.posts);
	return <PostList posts={pages.pages.flatMap((page) => page.items)} />;
}

function PrefetchedList(): ReactNode {
	const handle = prefetchList.useLoaderData<PrefetchRouter>();
	const [postsPromise, postsState] = useQuery(prefetching.postsQuery, handle);
	return (
		<Suspense fallback={<PostListSkeleton />} key={postsState.hash}>
			<PromisedList posts={postsPromise} />
		</Suspense>
	);
}

function PromisedPost(props: { readonly post: Promise<Post | undefined> }) {
	const post = use(props.post);
	return <PostBody post={post} />;
}

function PrefetchedComments(): ReactNode {
	const data = prefetchPost.useLoaderData<PrefetchRouter>();
	const [commentsPromise] = useQuery(prefetching.commentsQuery, data.comments);
	const pages = use(commentsPromise);
	return <CommentList comments={commentItems(pages)} />;
}

function PrefetchedPost(): ReactNode {
	const data = prefetchPost.useLoaderData<PrefetchRouter>();
	const [postPromise, postState] = useQuery(prefetching.postQuery, data.post);
	return (
		<PostPage>
			<Suspense fallback={<PostSkeleton />} key={postState.hash}>
				<PromisedPost post={postPromise} />
			</Suspense>
			<CommentsSection>
				<Suspense
					fallback={<CommentsSkeleton />}
					key={`${postState.hash}-comments`}
				>
					<PrefetchedComments />
				</Suspense>
			</CommentsSection>
		</PostPage>
	);
}

const ensuring = createBlog();
const ensureRoot = createRootRouteWithContext<RouterContext>()();
const ensurePost = createRoute({
	component: EnsuredPost,
	getParentRoute: () => ensureRoot,
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.id);
		return await allKeyed({
			comments: qc.ensure(ensuring.commentsQuery, { postId: id }),
			post: qc.ensure(ensuring.postQuery, { id }),
		});
	},
	path: "/posts/$id",
});
const ensureList = createRoute({
	component: EnsuredList,
	getParentRoute: () => ensureRoot,
	loader: (args) => args.context.queryClient.ensure(ensuring.postsQuery),
	path: "/posts",
});
const ensureTree = ensureRoot.addChildren([ensureList, ensurePost]);

function EnsuredList(): ReactNode {
	const handle = ensureList.useLoaderData<EnsureRouter>();
	const [pages] = useQuery(ensuring.postsQuery, handle);
	return <PostList posts={pages.pages.flatMap((page) => page.items)} />;
}

function EnsuredPost(): ReactNode {
	const data = ensurePost.useLoaderData<EnsureRouter>();
	const [post] = useQuery(ensuring.postQuery, data.post);
	const [pages] = useQuery(ensuring.commentsQuery, data.comments);
	return (
		<PostPage>
			<PostBody post={post} />
			<CommentsSection>
				<CommentList comments={commentItems(pages)} />
			</CommentsSection>
		</PostPage>
	);
}

const fetching = createBlog();
const fetchRoot = createRootRouteWithContext<RouterContext>()();
const fetchPost = createRoute({
	component: FetchedPost,
	getParentRoute: () => fetchRoot,
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.id);
		return await allKeyed({
			comments: qc.fetch(fetching.commentsQuery, { postId: id }),
			post: qc.fetch(fetching.postQuery, { id }),
		});
	},
	path: "/posts/$id",
});
const fetchList = createRoute({
	component: FetchedList,
	getParentRoute: () => fetchRoot,
	loader: (args) => args.context.queryClient.fetch(fetching.postsQuery),
	path: "/posts",
});
const fetchTree = fetchRoot.addChildren([fetchList, fetchPost]);

function FetchedList(): ReactNode {
	const handle = fetchList.useLoaderData<FetchRouter>();
	const [pages] = useQuery(fetching.postsQuery, handle);
	return <PostList posts={pages.pages.flatMap((page) => page.items)} />;
}

function FetchedPost(): ReactNode {
	const data = fetchPost.useLoaderData<FetchRouter>();
	const [post] = useQuery(fetching.postQuery, data.post);
	const [pages] = useQuery(fetching.commentsQuery, data.comments);
	return (
		<PostPage>
			<PostBody post={post} />
			<CommentsSection>
				<CommentList comments={commentItems(pages)} />
			</CommentsSection>
		</PostPage>
	);
}

export default defineDemo({
	hint: "Open a post with each, then switch back and forth: each keeps its own page and queries. The requests start at the same moment every time. Go back and reopen the post after 5 seconds, once its cache is stale, to see ensure and fetch differ.",
	title: "prefetch, ensure or fetch",
	variants: [
		{
			Component: () => <DemoRouter initial="/posts" routeTree={prefetchTree} />,
			description: "Opens the post at once, with skeletons.",
			label: "prefetch",
			server: prefetching.server,
		},
		{
			Component: () => <DemoRouter initial="/posts" routeTree={ensureTree} />,
			description:
				"Stays on the list until the post and its comments load. Cached data opens at once and refetches in the background.",
			label: "ensure",
			server: ensuring.server,
		},
		{
			Component: () => <DemoRouter initial="/posts" routeTree={fetchTree} />,
			description:
				"Stays on the list until the post and its comments load, and waits for the refetch whenever the cache is stale.",
			label: "fetch",
			server: fetching.server,
		},
	],
	variantsLabel: "Load each page with",
});
