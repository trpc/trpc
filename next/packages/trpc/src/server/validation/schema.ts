import {
  Effect,
  Match,
  Predicate,
  Schema,
  SchemaIssue,
  type SchemaAST,
} from 'effect';
import { TrpcError, type Failure } from '../../internal/error.ts';

/**
 * A [Standard Schema](https://standardschema.dev) issue.
 * @since 0.1.0
 * @stability stable
 */
export interface StandardIssue {
  readonly message: string;
  readonly path?:
    | ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
    | undefined;
}

type StandardResult<O> =
  | { readonly value: O; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

/**
 * The [Standard Schema](https://standardschema.dev) interface, implemented by
 * zod, valibot, ArkType and others.
 * @since 0.1.0
 * @stability stable
 */
export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardResult<O> | Promise<StandardResult<O>>;
    readonly types?: { readonly input: I; readonly output: O } | undefined;
  };
}

/**
 * A schema `.input()` and `.output()` accept: Standard Schema or Effect Schema.
 * @since 0.1.0
 * @stability stable
 */
export type AnySchema = StandardSchemaV1<any, any> | Schema.Top;

// A Standard Schema's types are read from `~standard.types` rather than
// inferred against this interface: every procedure with an input pays for
// that inference. `validate` is the fallback for schemas without `types`.
/** @internal */
export type InOf<S> = S extends StandardSchemaV1
  ? StandardIn<S, NonNullable<S['~standard']['types']>['input']>
  : S extends Schema.Top
    ? S['Encoded']
    : never;
type StandardIn<S, I> = unknown extends I
  ? S extends StandardSchemaV1<infer V, any>
    ? V
    : never
  : I;
/** @internal */
export type OutOf<S> = S extends StandardSchemaV1
  ? StandardOut<S, NonNullable<S['~standard']['types']>['output']>
  : S extends Schema.Top
    ? S['Type']
    : never;
type StandardOut<S, O> = unknown extends O
  ? S extends StandardSchemaV1<any, infer V>
    ? V
    : never
  : O;
/** @internal */
export type SchemaServices<S> = S extends Schema.Top
  ? S['DecodingServices']
  : never;

type IssueKey = string | number;
type AnyIssuePath = ReadonlyArray<IssueKey>;
/** Values a schema checks as a whole, so issues stop at them. */
type IssueLeaf =
  | Date
  | RegExp
  | ArrayBufferLike
  | ArrayBufferView
  | ((...args: never) => unknown)
  | { readonly arrayBuffer: () => unknown; readonly stream: () => unknown };

/**
 * The paths an issue about a `TInput` can have: `[]` for the whole input,
 * then a key or index per level (`['tags', 0]`). Object keys arrive as
 * strings. `unknown` inputs, `Map`s, `Set`s and levels past the sixth are
 * any path.
 * @since 0.1.0
 * @stability stable
 */
export type IssuePath<TInput> = unknown extends TInput
  ? AnyIssuePath
  : PathOf<TInput, []>;
type PathOf<T, D extends ReadonlyArray<0>> = T extends IssueLeaf
  ? readonly []
  : D['length'] extends 6
    ? AnyIssuePath
    : T extends ReadonlyArray<infer E>
      ? readonly [] | readonly [number, ...PathOf<E, [...D, 0]>]
      : T extends ReadonlyMap<any, any> | ReadonlySet<any>
        ? AnyIssuePath
        : T extends object
          ?
              | readonly []
              | {
                  [K in keyof T & IssueKey]-?: readonly [
                    K extends number ? `${K}` : K,
                    ...PathOf<T[K], [...D, 0]>,
                  ];
                }[keyof T & IssueKey]
          : readonly [];

/**
 * One problem with an input, from a schema that isn't zod or Effect Schema
 * (Valibot, ArkType, …): Standard Schema's `message` and `path`, with the
 * path typed from the schema's input type.
 * @since 0.1.0
 * @stability stable
 */
// Type literals, not interfaces: clients keep JSON-safe literals as written,
// where an interface's `data` would be rebuilt by `JsonOf`.
export type InputIssue<TInput = unknown> = {
  readonly message: string;
  /** Symbol keys arrive as their `String()`, so the data is plain JSON. */
  readonly path?: IssuePath<TInput> | undefined;
};

type ToIssueJson<T> = unknown extends T
  ? unknown
  : T extends bigint | symbol
    ? string
    : T extends string | number | boolean | null
      ? T
      : T extends undefined
        ? null
        : T extends ReadonlyArray<infer E>
          ? ReadonlyArray<ToIssueJson<E>>
          : T extends object
            ? { readonly [K in keyof T & string]: ToIssueJson<T[K]> }
            : never;

/**
 * A zod issue as it reaches the client: zod's own fields (`code`,
 * `minimum`, `format`, `keys`, …) without `input`, and `path` typed from the
 * schema's input type. Values JSON can't hold become JSON the same way under
 * every serializer: `bigint`s and symbols are strings, `undefined` in arrays
 * is `null`. `invalid_union` keeps its nested `errors`, and
 * `invalid_key`/`invalid_element` their nested `issues`, with paths relative
 * to the issue's own.
 * @since 0.1.0
 * @stability stable
 */
export type ZodInputIssue<
  TZodIssue,
  TPath = AnyIssuePath,
> = TZodIssue extends unknown
  ? {
      readonly [
        K in keyof TZodIssue as K extends 'input' ? never : K
      ]: K extends 'path'
        ? TPath
        : K extends 'errors' | 'issues'
          ? NestedZodIssues<TZodIssue[K]>
          : ToIssueJson<Exclude<TZodIssue[K], undefined>>;
    }
  : never;
type NestedZodIssues<T> = T extends readonly []
  ? readonly []
  : T extends ReadonlyArray<ReadonlyArray<infer I>>
    ? ReadonlyArray<ZodInputIssues<I>>
    : T extends ReadonlyArray<infer I>
      ? ZodInputIssues<I>
      : never;
/**
 * Nested zod issues. An interface, so the recursive issue type is resolved
 * lazily.
 * @since 0.1.0
 * @stability stable
 */
export interface ZodInputIssues<TZodIssue> extends ReadonlyArray<
  ZodInputIssue<TZodIssue>
> {}

/**
 * The part of a zod 4 schema's type that @trpc12/trpc reads. Zod is matched
 * by shape, never imported, so it stays optional.
 * @internal
 */
export interface ZodLike<TResult = unknown> {
  readonly _zod: { run(...args: never): TResult };
}

/**
 * Zod's issue union, read from a schema's type: a zod 4 schema's `_zod.run`
 * reports raw issues, and `invalid_union`'s nested `errors` are the finished
 * ones.
 * @internal
 */
export type ZodIssueOf<S> =
  S extends ZodLike<infer R>
    ? Extract<
        Awaited<R> extends { issues: ReadonlyArray<infer I> } ? I : never,
        { code: 'invalid_union' }
      > extends { errors: ReadonlyArray<ReadonlyArray<infer I>> }
      ? I
      : never
    : never;

/**
 * An Effect Schema issue as it reaches the client: one leaf of Effect's
 * issue tree, its message from Effect's Standard Schema formatter, and
 * `path` typed from the schema's encoded type.
 * @since 0.1.0
 * @stability stable
 */
export type EffectInputIssue<TInput = unknown> = {
  readonly _tag:
    | 'InvalidType'
    | 'InvalidValue'
    | 'MissingKey'
    | 'UnexpectedKey'
    | 'Forbidden'
    | 'OneOf'
    | 'AnyOf';
  readonly message: string;
  readonly path: IssuePath<TInput>;
  /**
   * Set when a check failed. Built-in checks have the `id` and `payload` of
   * their representation (`'effect/schema/isMinLength'`, `{ minLength: 3 }`).
   */
  readonly check?: { readonly id?: string; readonly payload?: unknown };
};

/**
 * The issues an input schema reports: {@link ZodInputIssue} for zod 4,
 * {@link EffectInputIssue} for Effect Schema, {@link InputIssue} otherwise.
 * @since 0.1.0
 * @stability stable
 */
export type inferInputIssue<S> = S extends StandardSchemaV1
  ? S extends ZodLike
    ? ZodOrStandardIssue<ZodIssueOf<S>, InOf<S>>
    : InputIssue<InOf<S>>
  : EffectInputIssue<InOf<S>>;
type ZodOrStandardIssue<TZodIssue, TInput> = [TZodIssue] extends [never]
  ? InputIssue<TInput>
  : ZodInputIssue<TZodIssue, IssuePath<TInput>>;

/**
 * The `data` of an input validation error.
 * @since 0.1.0
 * @stability stable
 */
export interface InputValidationErrorData<TIssue = InputIssue> {
  readonly issues: ReadonlyArray<TIssue>;
  /**
   * Type-only. Issues are made JSON on the server, so clients keep their
   * types under any serializer.
   */
  readonly '~issues'?: true;
}

/**
 * An input validation error with `TIssue` issues.
 * @since 0.1.0
 * @stability stable
 */
export type InputValidationError<TIssue = InputIssue> = TrpcError<
  'BAD_REQUEST',
  InputValidationErrorData<TIssue>,
  'InvalidInput'
>;

/**
 * {@link InputValidationErrorData} for input schema `S`. Its issues are
 * worked out only when read, so a procedure's type (and its declarations)
 * carries the schema rather than every issue the schema can report.
 * @since 0.1.0
 * @stability stable
 */
export interface SchemaInputErrorData<S> {
  readonly issues: ReadonlyArray<inferInputIssue<S>>;
  /** Type-only, as on {@link InputValidationErrorData}. */
  readonly '~issues'?: true;
}

/**
 * Added to the error union of every procedure with an input, one per
 * `.input()` schema `S`. Assignable to
 * `InputValidationError<inferInputIssue<S>>`.
 * @since 0.1.0
 * @stability stable
 */
export type SchemaValidationError<S> = TrpcError<
  'BAD_REQUEST',
  SchemaInputErrorData<S>,
  'InvalidInput'
>;

/** Effect Schema classes and ArkType types are functions too. @internal */
export const isSchema = (arg: unknown): arg is AnySchema =>
  typeof arg !== 'function' ||
  Schema.isSchema(arg) ||
  '~standard' in (arg as object);

const normalizePath = (
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>,
): ReadonlyArray<IssueKey> =>
  path.map((p) => {
    const key = typeof p === 'object' && p !== null ? p.key : p;
    return typeof key === 'symbol' ? String(key) : key;
  });

const toIssueJson = (value: unknown): unknown => {
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return String(value);
  }
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(toIssueJson);
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, inner]) =>
        inner === undefined ? [] : [[key, toIssueJson(inner)]],
      ),
    );
  }
  return value;
};

/** Zod's issue fields, without `input`: it echoes what the caller sent. */
const normalizeZodIssue = (issue: object): object => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(issue)) {
    if (key === 'input' || value === undefined) continue;
    out[key] =
      key === 'path' && Array.isArray(value)
        ? normalizePath(value)
        : key === 'issues' && Array.isArray(value)
          ? value.map(normalizeZodIssue)
          : key === 'errors' && Array.isArray(value)
            ? value.map((issues: ReadonlyArray<object>) =>
                issues.map(normalizeZodIssue),
              )
            : toIssueJson(value);
  }
  return out;
};

const normalizeIssues = (
  issues: ReadonlyArray<StandardIssue>,
  vendor: string,
): InputValidationErrorData['issues'] =>
  vendor === 'zod'
    ? (issues.map(normalizeZodIssue) as InputValidationErrorData['issues'])
    : issues.map((issue) => ({
        message: issue.message,
        ...(issue.path ? { path: normalizePath(issue.path) } : {}),
      }));

const formatEffectIssue =
  /* @__PURE__ */ SchemaIssue.makeFormatterStandardSchemaV1();

type EffectCheck = NonNullable<EffectInputIssue['check']>;

const effectLeaf = (
  issue: SchemaIssue.Issue,
  tag: EffectInputIssue['_tag'],
  path: ReadonlyArray<PropertyKey>,
  check: EffectCheck | undefined,
): Array<EffectInputIssue> =>
  formatEffectIssue(issue).issues.map((formatted) => ({
    _tag: tag,
    message: formatted.message,
    path: normalizePath([...path, ...(formatted.path ?? [])]),
    ...(check ? { check } : {}),
  }));

const checkOf = (filter: SchemaAST.Filter<unknown>): EffectCheck => {
  const representation = filter.annotations?.representation;
  return representation
    ? {
        id: representation.id,
        payload: representation.payload,
      }
    : {};
};

/**
 * Effect's issue tree, flattened like its Standard Schema formatter does,
 * keeping each leaf's `_tag` and the check that failed.
 */
const effectIssues = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey>,
  check: EffectCheck | undefined,
): Array<EffectInputIssue> =>
  Match.value(issue).pipe(
    Match.tagsExhaustive({
      Pointer: (pointer) =>
        effectIssues(pointer.issue, [...path, ...pointer.path], check),
      Encoding: (encoding) => effectIssues(encoding.issue, path, check),
      Composite: (composite) =>
        composite.issues.flatMap((inner) => effectIssues(inner, path, check)),
      AnyOf: (anyOf) =>
        anyOf.issues.length === 0
          ? effectLeaf(anyOf, 'AnyOf', path, check)
          : anyOf.issues.flatMap((inner) => effectIssues(inner, path, check)),
      Filter: (filter) =>
        Predicate.isTagged(filter.issue, 'InvalidValue') ||
        SchemaIssue.defaultCheckHook(filter) !== undefined
          ? effectLeaf(filter, 'InvalidValue', path, checkOf(filter.filter))
          : effectIssues(filter.issue, path, checkOf(filter.filter)),
      InvalidType: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
      InvalidValue: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
      MissingKey: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
      UnexpectedKey: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
      Forbidden: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
      OneOf: (leaf) => effectLeaf(leaf, leaf._tag, path, check),
    }),
  );

/**
 * Validates `value`. Effect Schemas decode with the services in the current
 * fiber, so a schema that needs a service gets the one the procedure provides.
 * @internal
 */
export function validate(
  schema: AnySchema,
  value: unknown,
  onIssues: (issues: InputValidationErrorData['issues']) => TrpcError,
): Effect.Effect<unknown, TrpcError> {
  if (Schema.isSchema(schema)) {
    return (
      Schema.decodeUnknownEffect(schema)(value, {
        errors: 'all',
      }) as Effect.Effect<unknown, Schema.SchemaError>
    ).pipe(
      Effect.mapError((err) =>
        onIssues(effectIssues(err.issue, [], undefined)),
      ),
    );
  }
  return Effect.suspend(() => {
    const result = schema['~standard'].validate(value);
    return result instanceof Promise
      ? Effect.promise(() => result)
      : Effect.succeed(result);
  }).pipe(
    Effect.flatMap((result) =>
      result.issues
        ? Effect.fail(
            onIssues(
              normalizeIssues(result.issues, schema['~standard'].vendor),
            ),
          )
        : Effect.succeed(result.value),
    ),
  );
}

const lift = <A>(
  out: A | Effect.Effect<any, any, any>,
): Effect.Effect<any, any, any> =>
  Effect.isEffect(out) ? out : Effect.succeed(out);

/**
 * `validate`, then `then` with the value: synchronously when the schema
 * validates synchronously, so a call with no async work stays out of the
 * fiber's run loop. `then` must not return its value as an Effect unless it
 * means one to run. @internal
 */
export function validateThen<A>(
  schema: AnySchema,
  value: unknown,
  onIssues: (issues: InputValidationErrorData['issues']) => TrpcError,
  then: (value: unknown) => A | Effect.Effect<any, any, any>,
): A | Effect.Effect<any, any, any> {
  if (Schema.isSchema(schema)) {
    return Effect.flatMap(validate(schema, value, onIssues), (v) =>
      lift(then(v)),
    );
  }
  let result: StandardResult<unknown> | Promise<StandardResult<unknown>>;
  try {
    result = schema['~standard'].validate(value);
  } catch (cause) {
    return Effect.die(cause);
  }
  if (result instanceof Promise) {
    return Effect.flatMap(
      Effect.promise(() => result),
      (r): Effect.Effect<any, any, any> =>
        r.issues
          ? Effect.fail(
              onIssues(normalizeIssues(r.issues, schema['~standard'].vendor)),
            )
          : lift(then(r.value)),
    );
  }
  return result.issues
    ? Effect.fail(
        onIssues(normalizeIssues(result.issues, schema['~standard'].vendor)),
      )
    : then(result.value);
}

/** @internal */
export const inputError = (
  issues: InputValidationErrorData['issues'],
): TrpcError<
  'BAD_REQUEST',
  { issues: InputValidationErrorData['issues'] },
  'InvalidInput'
> =>
  new TrpcError({
    code: 'BAD_REQUEST',
    tag: 'InvalidInput',
    message: 'Input validation failed',
    data: { issues },
    defined: true,
  });

/** @internal */
export const outputError = (
  issues: InputValidationErrorData['issues'],
): Failure<'InvalidOutput'> =>
  new TrpcError.InternalServerError({
    tag: 'InvalidOutput',
    message: 'Output validation failed',
    cause: new Error(
      `Output validation failed: ${issues.map((i) => i.message).join('; ')}`,
    ),
  });
