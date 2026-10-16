import { use } from "react";
import { useQuery, useWaterfall } from "@raf-query/react";
import type { Post } from "~/api.ts";
import { authorQuery } from "~/queries.ts";

declare function AuthorCard(props: {
	readonly author: unknown;
}): React.ReactNode;

// #region render-time-inputs-usewaterfall
function PostAuthor(props: { post: Post }) {
	const handle = useWaterfall(authorQuery, { id: props.post.authorId });
	const [authorPromise] = useQuery(authorQuery, handle);
	const author = use(authorPromise);
	return <AuthorCard author={author} />;
}
// #endregion
