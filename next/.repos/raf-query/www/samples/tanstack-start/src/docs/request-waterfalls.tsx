import { Suspense } from "react";
import { QueryClient } from "@raf-query/react";
import { authorQuery, postQuery } from "~/queries.ts";

declare function useSuspenseFetch(url: string): { title: string };

declare function PostBody(props: { readonly post: unknown }): React.ReactNode;

declare function CommentsSkeleton(): React.ReactNode;

declare function Comments(props: { readonly slug: string }): React.ReactNode;

// #region fetch-on-render
function Post(props: { slug: string }) {
	// Fetched during render: nothing below starts until this resolves.
	const post = useSuspenseFetch(`/posts/${props.slug}`);
	return (
		<>
			<PostBody post={post} />
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments slug={props.slug} />
			</Suspense>
		</>
	);
}
// #endregion

const qc = new QueryClient();

declare const slug: string;

// #region fetch-then-prefetch
const post = await qc.fetch(postQuery, { slug });
const author = qc.prefetch(authorQuery, { id: post.data.authorId });
// #endregion
