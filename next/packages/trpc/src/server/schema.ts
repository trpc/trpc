import { Effect, Schema, SchemaIssue } from 'effect';
import { TrpcError } from '../internal/error.ts';

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
 * One problem with an input. `path` is typed from the schema's input type.
 * @since 0.1.0
 * @stability stable
 */
// A type literal, not an interface: clients keep JSON-safe literals as
// written, where an interface's `data` would be rebuilt by `JsonOf`.
export type InputIssue<TInput = unknown> = {
  readonly message: string;
  /** Symbol keys arrive as their `String()`, so the data is plain JSON. */
  readonly path?: IssuePath<TInput> | undefined;
};

/**
 * The `data` of an input validation error.
 * @since 0.1.0
 * @stability stable
 */
export interface InputValidationErrorData<TInput = unknown> {
  readonly issues: ReadonlyArray<InputIssue<TInput>>;
}

/**
 * Added to the error union of every procedure with an input, one per
 * `.input()` schema, with `TInput` that schema's input type.
 * @since 0.1.0
 * @stability stable
 */
export type InputValidationError<TInput = unknown> = TrpcError<
  'BAD_REQUEST',
  InputValidationErrorData<TInput>
>;

/** Effect Schema classes and ArkType types are functions too. @internal */
export const isSchema = (arg: unknown): arg is AnySchema =>
  typeof arg !== 'function' ||
  Schema.isSchema(arg) ||
  '~standard' in (arg as object);

const formatEffectIssues = SchemaIssue.makeFormatterStandardSchemaV1();

const normalizeIssues = (
  issues: ReadonlyArray<StandardIssue>,
): InputValidationErrorData['issues'] =>
  issues.map((issue) => ({
    message: issue.message,
    ...(issue.path
      ? {
          path: issue.path.map((p) => {
            const key = typeof p === 'object' && p !== null ? p.key : p;
            return typeof key === 'symbol' ? String(key) : key;
          }),
        }
      : {}),
  }));

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
      Schema.decodeUnknownEffect(schema)(value) as Effect.Effect<
        unknown,
        Schema.SchemaError
      >
    ).pipe(
      Effect.mapError((err) =>
        onIssues(normalizeIssues(formatEffectIssues(err.issue).issues)),
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
        ? Effect.fail(onIssues(normalizeIssues(result.issues)))
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
          ? Effect.fail(onIssues(normalizeIssues(r.issues)))
          : lift(then(r.value)),
    );
  }
  return result.issues
    ? Effect.fail(onIssues(normalizeIssues(result.issues)))
    : then(result.value);
}

/** @internal */
export const inputError = (
  issues: InputValidationErrorData['issues'],
): TrpcError<'BAD_REQUEST', { issues: InputValidationErrorData['issues'] }> =>
  new TrpcError({
    code: 'BAD_REQUEST',
    message: 'Input validation failed',
    data: { issues },
    defined: true,
  });

/** @internal */
export const outputError = (
  issues: InputValidationErrorData['issues'],
): TrpcError<'INTERNAL_SERVER_ERROR'> =>
  new TrpcError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Output validation failed',
    cause: new Error(
      `Output validation failed: ${issues.map((i) => i.message).join('; ')}`,
    ),
  });
