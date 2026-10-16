import { hashKey, type QueryKey } from "@raf-query/react";

type RequestStatus = "aborted" | "error" | "pending" | "success";

export interface NetworkRequest {
	readonly endedAt: number | undefined;
	/** The hash of the query that sent it, or `undefined` for a write. */
	readonly hash: string | undefined;
	readonly id: number;
	readonly label: string;
	readonly startedAt: number;
	readonly status: RequestStatus;
}

export interface FakeServer<TDb> {
	/** The in-memory data, for handlers. Reset with {@link reset}. */
	readonly db: TDb;
	/** Fail the next `count` requests. */
	failNext(count: number): void;
	readonly failures: number;
	getRequests(): ReadonlyArray<NetworkRequest>;
	latency: number;
	/** Restore the seed data and clear the request log. */
	reset(): void;
	/**
	 * Answer a request after `latency` ms (± 25%). The result is cloned, as a
	 * response body parsed from JSON would be. A `queryFn` passes its context,
	 * so the log shows which query sent the request and when it was aborted.
	 */
	respond<T>(
		label: string,
		handler: (db: TDb) => T,
		options?: {
			readonly queryKey?: QueryKey;
			readonly signal?: AbortSignal;
		},
	): Promise<T>;
	subscribe(listener: () => void): () => void;
}

function wait(ms: number, signal: AbortSignal | undefined) {
	return new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(new DOMException("The request was aborted", "AbortError"));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolve();
		}, ms);
		if (signal?.aborted) {
			abort();
		}
		signal?.addEventListener("abort", abort, { once: true });
	});
}

/** The latencies a demo's toolbar offers. A server starts at `3G`. */
export const latencies = [
	{ label: "Fast", ms: 250 },
	{ label: "3G", ms: 900 },
	{ label: "Slow", ms: 2500 },
] as const;

/** A pretend backend that lives in the page, so demos need no network. */
export function createFakeServer<TDb>(seed: () => TDb): FakeServer<TDb> {
	let db = seed();
	let requests: ReadonlyArray<NetworkRequest> = [];
	let failures = 0;
	let nextId = 1;
	let generation = 0;
	const listeners = new Set<() => void>();

	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};

	const settle = (id: number, status: RequestStatus) => {
		requests = requests.map((request) =>
			request.id === id ? { ...request, endedAt: Date.now(), status } : request,
		);
		notify();
	};

	const server: FakeServer<TDb> = {
		get db() {
			return db;
		},
		failNext(count) {
			failures = count;
			notify();
		},
		get failures() {
			return failures;
		},
		getRequests: () => requests,
		latency: latencies[1].ms,
		reset() {
			db = seed();
			requests = [];
			failures = 0;
			generation++;
			notify();
		},
		async respond(label, handler, options) {
			const id = nextId++;
			const started = generation;
			requests = [
				...requests.slice(-11),
				{
					endedAt: undefined,
					hash: options?.queryKey ? hashKey(options.queryKey) : undefined,
					id,
					label,
					startedAt: Date.now(),
					status: "pending",
				},
			];
			notify();
			const jitter = 0.75 + Math.random() * 0.5;
			try {
				await wait(server.latency * jitter, options?.signal);
			} catch (error) {
				settle(id, "aborted");
				throw error;
			}
			if (started !== generation) {
				throw new DOMException("The demo was reset", "AbortError");
			}
			if (failures > 0) {
				failures--;
				settle(id, "error");
				throw new Error(`${label} failed (simulated)`);
			}
			const result = structuredClone(handler(db));
			settle(id, "success");
			return result;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
	return server;
}
