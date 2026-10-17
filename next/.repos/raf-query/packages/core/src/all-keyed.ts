/** The resolved form of a record passed to {@link allKeyed}. */
export type Settled<TRecord> = {
	-readonly [TKey in keyof TRecord]: Awaited<TRecord[TKey]>;
};

/**
 * Ponyfill of the TC39 `Promise.allKeyed` proposal: a record of promises in,
 * a promise of the same record out, rejecting on the first failure.
 *
 * ```ts
 * const data = await allKeyed({
 *   post: qc.ensure(postQuery, { slug }),
 *   author: qc.ensure(authorQuery, { slug }),
 * });
 * ```
 */
export async function allKeyed<
	TRecord extends { readonly [key: string]: unknown },
>(record: TRecord): Promise<Settled<TRecord>> {
	const keys = Object.keys(record);
	const values = await Promise.all(keys.map((key) => record[key]));
	const result = Object.fromEntries(
		keys.map((key, index) => [key, values[index]]),
	);
	// SAFETY: `result` has exactly `record`'s keys, each holding the awaited
	// value of the same key.
	return result as Settled<TRecord>;
}
