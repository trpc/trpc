import { useQueryClient } from "@raf-query/react";

import { createTodo } from "~/api.ts";
import { todosQuery } from "~/queries.ts";

// #region add-todo
export function AddTodo() {
	const qc = useQueryClient();
	return (
		<form
			action={async (formData) => {
				await createTodo({ title: String(formData.get("title")) });
				await qc.invalidate(todosQuery);
			}}
		>
			<input name="title" />
			<button>Add</button>
		</form>
	);
}
// #endregion
