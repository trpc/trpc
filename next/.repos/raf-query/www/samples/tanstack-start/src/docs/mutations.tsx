import { useOptimistic } from "react";
import { useQueryClient } from "@raf-query/react";
import { type Post, updatePost } from "~/api.ts";
import { postQuery } from "~/queries.ts";
import { useTransition } from "react";
import { QueryClient } from "@raf-query/react";
import { infiniteQueryOptions } from "@raf-query/react";

// #region intro
function EditTitle(props: { post: Post }) {
	const qc = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.post.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updatePost({ slug: props.post.slug, title: next });
				await qc.invalidate(postQuery, { slug: props.post.slug });
			}}
		>
			<input name="title" defaultValue={title} />
		</form>
	);
}
// #endregion

const qc = new QueryClient();

declare function deletePost(slug: string): Promise<void>;

declare const props: { slug: string };

function postsQuery() {
	return infiniteQueryOptions({
		queryKey: ["posts"],
		queryFn: async () => ({
			items: [] as Array<{ slug: string }>,
			nextCursor: null,
		}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

// #region pending-state
const [isPending, startTransition] = useTransition();

<button
	disabled={isPending}
	onClick={() => {
		startTransition(async () => {
			await deletePost(props.slug);
			await qc.invalidate(postsQuery);
		});
	}}
>
	Delete
</button>;
// #endregion
