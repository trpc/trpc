import { QueryClient, queryOptions, useQuery } from "@raf-query/react";

interface Endpoint<TArgs, TData> {
	readonly name: string;
}

declare function call<TArgs, TData>(
	endpoint: Endpoint<TArgs, TData>,
	args: TArgs,
): Promise<TData>;

declare const api: {
	posts: {
		get: Endpoint<{ slug: string }, { title: string }>;
	};
};

declare const slug: string;

const qc = new QueryClient();

// #region factory-makers
function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
	return (args: TArgs) =>
		queryOptions({
			queryKey: [endpoint.name, args],
			queryFn: (): Promise<TData> => call(endpoint, args),
		});
}

const post = await qc.ensure(endpointQuery(api.posts.get), { slug });
const [postPromise] = useQuery(endpointQuery(api.posts.get), post);
// #endregion
