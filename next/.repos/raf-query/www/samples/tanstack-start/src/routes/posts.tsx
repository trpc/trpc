import { useQuery } from "@raf-query/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { use } from "react";

import { PostList } from "~/components/post-list.tsx";
import { postsQuery } from "~/queries.ts";

// #region route
import { z } from "zod";

const PostsSearch = z.object({
	sort: z.enum(["newest", "oldest"]).default("newest"),
	page: z.int().positive().default(1),
});

export const Route = createFileRoute("/posts")({
	validateSearch: PostsSearch,
	loaderDeps: (args) => args.search,
	loader: (args) => ({
		posts: args.context.queryClient.prefetch(postsQuery, args.deps),
	}),
	component: PostsPage,
});

function PostsPage() {
	const loaderData = Route.useLoaderData();
	const [postsPromise, postsState] = useQuery(postsQuery, loaderData.posts, {
		whilePending: "previous",
	});
	const posts = use(postsPromise);

	return (
		<>
			<nav aria-busy={postsState.isPrevious}>
				<Link to="." search={(prev) => ({ ...prev, sort: "newest" })}>
					Newest
				</Link>
				<Link to="." search={(prev) => ({ ...prev, sort: "oldest" })}>
					Oldest
				</Link>
			</nav>
			<PostList posts={posts} dimmed={postsState.isPrevious} />
		</>
	);
}
// #endregion
