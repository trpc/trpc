import { isPlainRecord } from "./key.ts";

function isPlainArray(value: unknown): value is ReadonlyArray<unknown> {
	return Array.isArray(value) && value.length === Object.keys(value).length;
}

function share(previous: unknown, next: unknown, depth: number): unknown {
	if (previous === next || depth > 500) {
		return next;
	}
	if (isPlainArray(previous) && isPlainArray(next)) {
		let equal = previous.length === next.length;
		const copy = next.map((item, index) => {
			const shared = share(previous[index], item, depth + 1);
			equal &&= shared === previous[index];
			return shared;
		});
		return equal ? previous : copy;
	}
	if (isPlainRecord(previous) && isPlainRecord(next)) {
		const names = Object.keys(next);
		let equal = names.length === Object.keys(previous).length;
		const copy: Record<string, unknown> = {};
		for (const name of names) {
			const shared = share(previous[name], next[name], depth + 1);
			equal &&= shared === previous[name] && Object.hasOwn(previous, name);
			copy[name] = shared;
		}
		return equal ? previous : copy;
	}
	return next;
}

/**
 * `next`, reusing every part of `previous` that is deeply equal to it: all
 * of `previous` when nothing changed, else a copy of `next` whose unchanged
 * subtrees are `previous`'s. Only plain objects and arrays are compared;
 * anything else is taken from `next`. TanStack Query's `replaceEqualDeep`.
 */
export function replaceEqualDeep<T>(previous: unknown, next: T): T {
	// SAFETY: `share` returns `next`, or `previous` / a copy only where they
	// are deeply equal to `next`, so the result has `next`'s shape.
	return share(previous, next, 0) as T;
}
