/**
 * E) Each module declares its own registry with `createErrors()`, and its
 * base procedure declares it: `t.procedure.errors(postErrors)`. v12's
 * declarations are exhaustive, so a post resolver returning a billing
 * error is a type error, and a post call's union is the post module's
 * errors (plus what middleware returns), inferred by the client from
 * `typeof appRouter`. `mergeErrors()` makes the backend's list (a tag in
 * two is a type error), for OpenAPI and docs; nothing on the client reads
 * it.
 */
import type { Registry } from '../shared/define.ts';

export { createErrors } from '../create-errors/create-errors.ts';

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
