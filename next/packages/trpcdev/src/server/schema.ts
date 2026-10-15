import { Effect, Schema, SchemaIssue } from 'effect';
import { TrpcError } from '../internal/error.ts';

/**
 * A [Standard Schema](https://standardschema.dev) issue.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type AnySchema = StandardSchemaV1<any, any> | Schema.Top;

/** @internal */
export type InOf<S> = S extends Schema.Top
  ? S['Encoded']
  : S extends StandardSchemaV1<infer I, any>
    ? I
    : never;
/** @internal */
export type OutOf<S> = S extends Schema.Top
  ? S['Type']
  : S extends StandardSchemaV1<any, infer O>
    ? O
    : never;
/** @internal */
export type SchemaServices<S> = S extends Schema.Top
  ? S['DecodingServices']
  : never;

/**
 * The `data` of an input validation error.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface InputValidationErrorData {
  readonly issues: ReadonlyArray<{
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey> | undefined;
  }>;
}

/**
 * Added to the error union of every procedure with an input.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type InputValidationError = TrpcError<
  'BAD_REQUEST',
  InputValidationErrorData
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
          path: issue.path.map((p) =>
            typeof p === 'object' && p !== null ? p.key : p,
          ),
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
  return Effect.promise(async () => schema['~standard'].validate(value)).pipe(
    Effect.flatMap((result) =>
      result.issues
        ? Effect.fail(onIssues(normalizeIssues(result.issues)))
        : Effect.succeed(result.value),
    ),
  );
}

/** @internal */
export const inputError = (issues: InputValidationErrorData['issues']) =>
  new TrpcError({
    code: 'BAD_REQUEST',
    message: 'Input validation failed',
    data: { issues },
    defined: true,
  });

/** @internal */
export const outputError = (issues: InputValidationErrorData['issues']) =>
  new TrpcError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Output validation failed',
    cause: new Error(
      `Output validation failed: ${issues.map((i) => i.message).join('; ')}`,
    ),
  });
