import { Effect, Schema, Stream } from 'effect';
import { TrpcError } from '../../internal/error.ts';
import type { DansonForm } from '../../internal/types.ts';
import type { ProcedureInternals, Step } from '../../server/procedure.ts';
import {
  inputError,
  isSchema,
  validate,
  type AnySchema,
  type InputValidationErrorData,
} from '../../server/schema.ts';
import { isStreamSchema } from '../../server/stream-schema.ts';
import { link, type TrpcLink } from '../link.ts';

/**
 * Options for {@link validationLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface ValidationLinkOptions {
  /** Where the schemas come from: a contract (`@trpc12/trpc/contract`) or a router. */
  contract: object;
  /** Validate inputs before sending. @default true */
  input?: boolean;
  /**
   * Validate results. `'json'` decodes plain JSON results (`httpLink`'s
   * default serializer, `openApiLink`) with the Effect Schema's JSON codec,
   * so `Date`s, `bigint`s and classes come back as their types.
   * @default true
   */
  output?: boolean | 'json';
}

const outputMismatch = (
  issues: InputValidationErrorData['issues'],
): TrpcError<'PARSE_ERROR'> =>
  new TrpcError({
    code: 'PARSE_ERROR',
    message: `Response validation failed: ${issues.map((i) => i.message).join('; ')}`,
    data: { issues },
  });

const definitionAt = (
  tree: object,
  path: string,
): ProcedureInternals | undefined => {
  let node: unknown = tree;
  for (const segment of path.split('.')) {
    if (
      typeof node !== 'object' ||
      node === null ||
      '~trpc' in node ||
      !Object.hasOwn(node, segment)
    ) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'object' && node !== null && '~trpc' in node
    ? (node as { '~trpc': ProcedureInternals })['~trpc']
    : undefined;
};

const inputSchemas = (steps: ReadonlyArray<Step>): AnySchema[] =>
  steps.flatMap((step) =>
    step.kind === 'input' && isSchema(step.arg) ? [step.arg] : [],
  );

/** The schema a received value is checked with: its type side, which has no transformations to run twice. */
const receiving = (schema: AnySchema, json: boolean): AnySchema =>
  Schema.isSchema(schema)
    ? json
      ? Schema.toCodecJson(Schema.toType(schema))
      : Schema.toType(schema)
    : schema;

const isEnvelope = (value: unknown): value is { id: string; data: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'string' &&
  'data' in value &&
  Object.keys(value).length === 2;

/**
 * Validates calls against a contract's schemas on the client: inputs before
 * they are sent (failing with the same `BAD_REQUEST` the server would), and
 * results and subscription events after they arrive (`PARSE_ERROR`). Results
 * are checked against the output's type side, so Effect Schema
 * transformations don't run twice. Inputs from functions (context-aware) and
 * streamed (`stream()`) outputs are not checked. Paths the contract doesn't
 * have pass through. With `output: 'json'` the client types results as
 * the schemas' types again, not the JSON form plain-JSON links declare.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: appContract,
 *   links: [validationLink({ contract: appContract }), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function validationLink(
  opts: ValidationLinkOptions & { output: 'json' },
): TrpcLink<{ form: DansonForm }>;
export function validationLink(opts: ValidationLinkOptions): TrpcLink;
export function validationLink(opts: ValidationLinkOptions): TrpcLink<any> {
  const json = opts.output === 'json';
  return link((args) => {
    const { op } = args;
    const def = definitionAt(opts.contract, op.path);
    if (!def) return args.next(op);
    const checkInput =
      opts.input === false
        ? Effect.void
        : Effect.forEach(
            inputSchemas(def.steps),
            (schema) => validate(schema, op.input, inputError),
            { discard: true },
          );
    const result = Stream.unwrap(Effect.as(checkInput, args.next(op)));
    const output =
      opts.output === false || def.validateOutput === false
        ? undefined
        : def.output;
    if (!output) return result;
    if (op.type !== 'subscription') {
      if (isStreamSchema(output)) return result;
      const schema = receiving(output, json);
      return Stream.mapEffect(result, (value) =>
        validate(schema, value, outputMismatch),
      );
    }
    const event = isStreamSchema(output) ? output['~trpc.stream'].item : output;
    const schema = receiving(event, json);
    return Stream.mapEffect(result, (value) =>
      isEnvelope(value)
        ? Effect.map(validate(schema, value.data, outputMismatch), (data) => ({
            id: value.id,
            data,
          }))
        : validate(schema, value, outputMismatch),
    );
  });
}
