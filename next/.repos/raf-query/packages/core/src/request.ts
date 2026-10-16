import { Context, Effect, Scope } from "effect";

import type { QueryFnResult } from "./options.ts";

function isEffectResult<T, E, R>(
	result: QueryFnResult<{ data: T; error: E; services: R }>,
): result is Effect.Effect<T, E, R> {
	return Effect.isEffect(result);
}

/**
 * One `queryFn` call as an Effect. The signal it gets aborts when the fiber
 * is interrupted; a returned Effect runs in the same fiber, so interrupting
 * the request interrupts it. Plain values settle like promises, a microtask
 * later. A `queryFn` that throws instead of returning is a defect, as in
 * `Effect.sync`.
 */
export function fromQueryFn<T, E, R>(
	call: (
		signal: AbortSignal,
	) => QueryFnResult<{ data: T; error: E; services: R }>,
): Effect.Effect<T, E, R> {
	return Effect.callback<T, E, R>((resume, signal) => {
		let result: QueryFnResult<{ data: T; error: E; services: R }>;
		try {
			result = call(signal);
		} catch (error) {
			resume(Effect.die(error));
			return;
		}
		if (isEffectResult(result)) {
			resume(result);
			return;
		}
		Promise.resolve(result).then(
			(value) => resume(Effect.succeed(value)),
			// A rejection's type is unknown; `E` is `unknown` for every
			// `queryFn` that returns a promise.
			(error: E) => resume(Effect.fail(error)),
		);
	});
}

/**
 * The services a request runs with: the cache's, under those of the verb
 * that last called for the entry. The caller's `Scope` is left out: a
 * request outlives the call that started it.
 */
export function requestServices(
	cache: Context.Context<never>,
	caller: Context.Context<never>,
): Context.Context<never> {
	return Context.merge(cache, Context.omit(Scope.Scope)(caller));
}

/**
 * A request as it runs: in a `raf-query.request` span, with `services`,
 * which hold what its `queryFn` Effect needs (entries erase that type with
 * the data's). Typed failures become the query's error; defects are logged
 * too, since nothing else reports them.
 */
export function runRequest<A, E>(
	request: Effect.Effect<A, E>,
	hash: string,
	services: Context.Context<never>,
): Effect.Effect<A, E> {
	return request.pipe(
		Effect.tapDefect((defect) =>
			Effect.logError("raf-query: queryFn died", defect),
		),
		Effect.withSpan("raf-query.request", {
			attributes: { "raf_query.hash": hash },
		}),
		Effect.provideContext(services),
	);
}
