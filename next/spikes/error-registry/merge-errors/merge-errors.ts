/**
 * D) Each module declares its own registry with `createErrors()`, and
 * `mergeErrors()` makes the backend's (a tag in two is a type error).
 * `scope()` gives a router subtree its module's errors, so `client.post.*`
 * fails with the post and auth errors and not the billing ones: still
 * ahead of time, but closer to what a call can do.
 */
import type { AnyRouter } from '@trpc12/trpc/server';
import type { Scoped } from '../shared/client.ts';
import type { ErrorsOf, Registry } from '../shared/define.ts';

export {
  createClient,
  createEffectClient,
  createErrors,
  withErrors,
} from '../create-errors/create-errors.ts';

type Merge<Rs> = Rs extends readonly [infer H, ...infer T] ? H & Merge<T> : {};

type Overlap<Rs, Seen = never> = Rs extends readonly [infer H, ...infer T]
  ? (keyof H & Seen) | Overlap<T, Seen | keyof H>
  : never;

type NoDuplicates<Rs> = [Overlap<Rs>] extends [never]
  ? unknown
  : { readonly '~duplicate': `'${Overlap<Rs> & string}' is in two registries` };

/** The backend's registry from its modules'. */
export function mergeErrors<const Rs extends ReadonlyArray<Registry>>(
  ...registries: Rs & NoDuplicates<Rs>
): Merge<Rs> {
  const merged: Record<string, unknown> = {};
  for (const registry of registries as ReadonlyArray<Registry>) {
    for (const tag of Object.keys(registry)) {
      if (tag in merged) throw new TypeError(`'${tag}' is in two registries`);
      merged[tag] = registry[tag];
    }
  }
  return merged as Merge<Rs>;
}

/** A subtree whose calls also fail with `errors`. */
export const scope = <const E extends Registry, R extends AnyRouter>(
  _errors: E,
  router: R,
): R & Scoped<ErrorsOf<E>> =>
  router as R & Scoped<ErrorsOf<E>>;
