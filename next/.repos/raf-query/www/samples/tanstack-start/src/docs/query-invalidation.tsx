import { useQueryClient } from "@raf-query/react";

declare function addTodo(text: string): Promise<void>;

function Example() {
	const qc = useQueryClient();
	return (
		// #region invalidating-from-mutations
		<form
			action={async (formData) => {
				await addTodo(String(formData.get("text")));
				await qc.invalidate({ queryKey: ["todos"] });
			}}
		>
			{/* ... */}
		</form>
	);
}
// #endregion
