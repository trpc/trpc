const show = (value: unknown): string =>
  typeof value === 'string'
    ? JSON.stringify(value)
    : typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === undefined ||
        value === null
      ? `${value}`
      : typeof value;

/**
 * Decodes a `batch` option once, where it's read: `false` turns batching
 * off (`undefined`), `{ maxItems }` caps a batch at that many calls.
 * There's no default size, so anything else, `true` and `{}` included,
 * throws when the handler or link is made. A missing option is the
 * caller's to default.
 * @internal
 */
export const batchMaxItems = (
  owner: string,
  batch: unknown,
): number | undefined => {
  if (batch === false) return undefined;
  const maxItems =
    typeof batch === 'object' && batch !== null
      ? (batch as { readonly maxItems?: unknown }).maxItems
      : undefined;
  if (
    typeof maxItems === 'number' &&
    Number.isSafeInteger(maxItems) &&
    maxItems > 0
  ) {
    return maxItems;
  }
  const got =
    batch === undefined
      ? 'no batch'
      : typeof batch === 'object' && batch !== null
        ? `{ maxItems: ${show(maxItems)} }`
        : show(batch);
  throw new TypeError(
    `${owner}: batch is false or { maxItems }, a positive integer capping the calls in one batch (batch: { maxItems: 100 }); got ${got}`,
  );
};
