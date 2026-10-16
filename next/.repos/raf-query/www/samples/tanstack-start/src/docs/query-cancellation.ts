import { queryOptions } from "@raf-query/react";

declare const axios: {
	get(url: string, options: { signal: AbortSignal }): Promise<unknown>;
};

declare const input: { id: number };

// #region using-axios-or-other-clients
queryOptions({
	queryKey: ["todos", input.id],
	queryFn: (context) =>
		axios.get(`/api/todos/${input.id}`, { signal: context.signal }),
});
// #endregion

declare const client: {
	get(url: string): {
		cancel(): void;
		promise: Promise<unknown>;
	};
};

// #region abort-listener
queryOptions({
	queryKey: ["todos", input.id],
	queryFn: (context) => {
		const request = client.get(`/todos/${input.id}`);
		context.signal.addEventListener("abort", () => request.cancel());
		return request.promise;
	},
});
// #endregion
