import { Link } from "@tanstack/react-router";

import type { Post } from "~/api.ts";

export function PostList(props: {
	readonly dimmed: boolean;
	readonly posts: ReadonlyArray<Post>;
}) {
	return (
		<ul style={{ opacity: props.dimmed ? 0.5 : 1 }}>
			{props.posts.map((post) => (
				<li key={post.slug}>
					<Link to="/posts/$slug" params={{ slug: post.slug }}>
						{post.title}
					</Link>
				</li>
			))}
		</ul>
	);
}
