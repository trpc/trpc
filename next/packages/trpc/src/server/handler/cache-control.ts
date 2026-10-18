type Directives = Map<string, string | undefined>;

const parse = (value: string): Directives =>
  new Map(
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part): [string, string | undefined] => {
        const eq = part.indexOf('=');
        if (eq === -1) return [part.toLowerCase(), undefined];
        return [
          part.slice(0, eq).trim().toLowerCase(),
          part
            .slice(eq + 1)
            .trim()
            .replace(/^"(.*)"$/, '$1'),
        ];
      }),
  );

/** A lifetime that isn't a number of seconds is stale (RFC 9111 4.2.1). */
const seconds = (value: string | undefined, present: boolean) => {
  if (!present) return undefined;
  const n = Number(value);
  return value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(n)
    ? n
    : 0;
};

/**
 * The `cache-control` of a batch: the strictest policy every call allows,
 * or `undefined` when a call set none, so the batch isn't cached. `no-store`
 * and `no-cache` win; `private` wins over `public`, which needs every call;
 * lifetimes take the smallest; `immutable` needs every call. Directives it
 * doesn't know are dropped. @internal
 */
export function strictestCacheControl(
  values: ReadonlyArray<string | null | undefined>,
): string | undefined {
  if (values.length === 0) return undefined;
  const policies: Directives[] = [];
  for (const value of values) {
    if (value === null || value === undefined || value.trim() === '') {
      return undefined;
    }
    policies.push(parse(value));
  }
  const some = (name: string) => policies.some((p) => p.has(name));
  const every = (name: string) => policies.every((p) => p.has(name));
  if (some('no-store')) return 'no-store';
  if (some('no-cache')) return 'no-cache';

  /** The smallest of the calls' values, each from the first name it has. */
  const smallest = (names: string[], required: boolean) => {
    let min: number | undefined;
    for (const policy of policies) {
      const own = names
        .map((name) => seconds(policy.get(name), policy.has(name)))
        .find((n) => n !== undefined);
      if (own === undefined) {
        if (required) return undefined;
        continue;
      }
      min = min === undefined ? own : Math.min(min, own);
    }
    return min;
  };

  const out: string[] = [];
  const isPrivate = some('private');
  if (isPrivate) out.push('private');
  else if (every('public')) out.push('public');
  const maxAge = smallest(['max-age'], false);
  if (maxAge !== undefined) out.push(`max-age=${maxAge}`);
  if (!isPrivate && some('s-maxage')) {
    const shared = smallest(['s-maxage', 'max-age'], true);
    if (shared !== undefined) out.push(`s-maxage=${shared}`);
  }
  for (const name of ['stale-while-revalidate', 'stale-if-error']) {
    const value = smallest([name], true);
    if (value !== undefined) out.push(`${name}=${value}`);
  }
  for (const name of ['must-revalidate', 'proxy-revalidate', 'no-transform']) {
    if (some(name)) out.push(name);
  }
  if (every('immutable')) out.push('immutable');
  return out.length === 0 ? undefined : out.join(', ');
}
