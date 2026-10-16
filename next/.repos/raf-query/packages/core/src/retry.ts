import { Effect, Predicate, Schedule } from "effect";

import type { QueryBehavior } from "./options.ts";

/** Doubling from 1 s, at most 30 s. */
const defaultDelays = /*#__PURE__*/ Schedule.min([
	Schedule.exponential("1 second"),
	Schedule.spaced("30 seconds"),
]);

function delays(
	retryDelay: QueryBehavior["retryDelay"],
): Schedule.Schedule<unknown> {
	if (retryDelay === undefined) {
		return defaultDelays;
	}
	if (Predicate.isNumber(retryDelay)) {
		return Schedule.spaced(retryDelay);
	}
	return Schedule.forever.pipe(
		Schedule.modifyDelay((step) =>
			Effect.succeed(retryDelay(step.attempt, step.input)),
		),
	);
}

/**
 * A query's retry options as one `Schedule`, or `undefined` when it doesn't
 * retry. `retryDelay` sets the delays; a count or predicate in `retry` stops
 * the schedule, given the attempt number (1 after the first failure) and the
 * error.
 */
export function retrySchedule(
	behavior: Pick<QueryBehavior, "retry" | "retryDelay">,
	isServer: boolean,
): Schedule.Schedule<unknown, unknown> | undefined {
	const retry = behavior.retry ?? (isServer ? 0 : 3);
	if (Schedule.isSchedule(retry)) {
		return retry;
	}
	if (retry === false || retry === 0) {
		return undefined;
	}
	const schedule = delays(behavior.retryDelay);
	if (retry === true) {
		return schedule;
	}
	return schedule.pipe(
		Schedule.while((step) =>
			Predicate.isNumber(retry)
				? step.attempt <= retry
				: retry(step.attempt, step.input),
		),
	);
}
