import { queryOptions } from "@raf-query/core";

export interface Issue {
	readonly id: number;
	readonly title: string;
}

/**
 * An in-memory backend whose requests settle only when the test says so, so
 * tests can observe the cache mid-request.
 */
export function createBackend() {
	const issues = new Map<number, Issue>([
		[1, { id: 1, title: "First" }],
		[2, { id: 2, title: "Second" }],
	]);
	const requests: Array<{
		fail(error: unknown): void;
		readonly id: number;
		respond(): void;
		readonly signal: AbortSignal;
	}> = [];

	function getIssue(id: number, signal: AbortSignal) {
		const deferred = Promise.withResolvers<Issue>();
		requests.push({
			fail: deferred.reject,
			id,
			respond: () => {
				const issue = issues.get(id);
				if (issue) {
					deferred.resolve(issue);
				} else {
					deferred.reject(new Error(`No issue ${id}`));
				}
			},
			signal,
		});
		return deferred.promise;
	}

	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: (context) => getIssue(input.id, context.signal),
			queryKey: ["issue", input.id],
			retry: false,
		});
	}

	return {
		issueQuery,
		issues,
		requests,
		/** Settle every open request. */
		respondAll() {
			for (const request of requests.splice(0)) {
				request.respond();
			}
		},
	};
}

/** Let queued microtasks and promise callbacks run. */
export function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}
