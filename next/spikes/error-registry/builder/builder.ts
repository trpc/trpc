/**
 * D) A builder chain: `errors().add(tag, spec)` once per error. Each step
 * checks the tag isn't taken, and `extend()` adds another chain's errors,
 * so a registry can be assembled from parts. Server code only, like B:
 * resolvers return its entries and the client infers them per call.
 * `registryOf()` is the plain registry, for `.errors()`.
 */
import {
  defineError,
  type AnyErrorMaker,
  type ErrorMaker,
  type ErrorSpec,
} from '../shared/define.ts';

export interface BuilderMethods<M> {
  add<const T extends string, const S extends ErrorSpec>(
    tag: T extends keyof M ? `'${T}' is already in the registry` : T,
    spec: S,
  ): ErrorsBuilder<M & { readonly [K in T]: ErrorMaker<T, S> }>;
  extend<N>(other: ErrorsBuilder<N>): ErrorsBuilder<M & N>;
}

/** The registry so far: its entries by tag, and the next step. */
export type ErrorsBuilder<M> = M & BuilderMethods<M>;

const entriesOf = (b: object) =>
  Object.fromEntries(
    Object.entries(b).filter(([, v]) => typeof v === 'function' && 'spec' in v),
  ) as Record<string, AnyErrorMaker>;

const make = (entries: Record<string, AnyErrorMaker>): ErrorsBuilder<any> => ({
  ...entries,
  add: (tag: string, spec: ErrorSpec) => {
    if (tag in entries)
      throw new TypeError(`'${tag}' is already in the registry`);
    return make({ ...entries, [tag]: defineError(tag, spec) });
  },
  extend: (other: object) => make({ ...entries, ...entriesOf(other) }),
});

export const errors = (): ErrorsBuilder<{}> => make({});

/** The entries alone, without the builder's methods: an `.errors()` map. */
export const registryOf = <M>(b: ErrorsBuilder<M>): M => entriesOf(b) as M;
