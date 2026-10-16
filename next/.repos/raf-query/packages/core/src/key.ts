import { Predicate } from "effect";

/**
 * A query's cache key. Must be JSON-serializable (plain objects, arrays and
 * primitives): it travels inside handles.
 */
export type QueryKey = ReadonlyArray<unknown>;

export function isPlainRecord(
	value: unknown,
): value is { readonly [key: string]: unknown } {
	if (!Predicate.isObject(value) || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sortKeys(_name: string, value: unknown) {
	if (!isPlainRecord(value)) {
		return value;
	}
	const sorted: Record<string, unknown> = {};
	for (const name of Object.keys(value).toSorted()) {
		sorted[name] = value[name];
	}
	return sorted;
}

/**
 * Stable string form of a key. Object keys are sorted, so `{ a, b }` and
 * `{ b, a }` hash the same.
 */
export function hashKey(key: QueryKey): string {
	return JSON.stringify(key, sortKeys);
}

function partialMatch(actual: unknown, expected: unknown): boolean {
	if (actual === expected) {
		return true;
	}
	if (Array.isArray(actual) && Array.isArray(expected)) {
		return (
			actual.length === expected.length &&
			expected.every((part, index) => partialMatch(actual[index], part))
		);
	}
	if (isPlainRecord(actual) && isPlainRecord(expected)) {
		return Object.keys(expected).every((name) =>
			partialMatch(actual[name], expected[name]),
		);
	}
	return false;
}

/**
 * Whether `key` starts with `prefix`. Object segments match when every field
 * in the prefix's segment matches, so `["posts", { sort: "new" }]` matches
 * `["posts", { sort: "new", page: 2 }]`.
 */
export function matchesKey(key: QueryKey, prefix: QueryKey): boolean {
	return (
		prefix.length <= key.length &&
		prefix.every((part, index) => partialMatch(key[index], part))
	);
}
