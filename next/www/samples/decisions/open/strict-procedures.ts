/**
 * The APIs `.agent-docs/open/strict-procedures.md` proposes, as types: B's
 * `.strict()` on a base procedure, C's `initTrpc({ strict: true })`. A is the
 * builder as it is. A strict builder refuses a terminal until `.output()`
 * is declared, and keeps `.errors()`'s exhaustive check on from the start,
 * so a resolver may return only errors it declares. The stub checks the
 * output only on the strict builder's own `.input()` and `.errors()` chain;
 * `.use()` gives the plain builder back.
 */
import type {
  AnyProcedureBuilder,
  AnySchema,
  DeclaredErrors,
  ErrorMapInput,
  ProcedureBuilder,
  RootConfig,
  RootOptions,
  TrpcRoot,
} from '@trpc12/trpc/server';
import type {
  BuilderDef,
  InputDef,
  TypeError,
  With,
} from '@trpc12/trpc/internal';

type DefOf<B extends AnyProcedureBuilder> = NonNullable<B['~trpc']['~types']>;

/** A declared key with no error, so `.errors()`'s check runs before any are declared, and later steps keep it. */
type Marked<TDef extends BuilderDef> = With<
  TDef,
  { declared: TDef['declared'] & { '~strict': never } }
>;

/** B and C: a builder that requires `.output()` and `.errors()`. */
export type StrictBuilderB<TDef extends BuilderDef> = Omit<
  ProcedureBuilder<TDef>,
  'input' | 'errors' | 'query' | 'mutation' | 'subscription'
> & {
  input<$S extends AnySchema>(schema: $S): StrictBuilderB<InputDef<TDef, $S>>;
  errors<const $Map extends ErrorMapInput>(
    map: $Map,
  ): StrictBuilderB<
    With<
      TDef,
      {
        declared: TDef['declared'] & DeclaredErrors<$Map>;
        errors: TDef['errors'] | DeclaredErrors<$Map>[keyof $Map & string];
      }
    >
  >;
  query(
    resolver: TypeError<'strict: declare the output with .output()'>,
  ): never;
  mutation(
    resolver: TypeError<'strict: declare the output with .output()'>,
  ): never;
  subscription(
    resolver: TypeError<'strict: declare the output with .output()'>,
  ): never;
};

/** B: a builder with `.strict()`. */
export type StrictableB<B extends AnyProcedureBuilder> = B & {
  strict(): StrictBuilderB<Marked<DefOf<B>>>;
};

/** B: gives a builder `.strict()`. */
export declare function strictableB<B extends AnyProcedureBuilder>(
  builder: B,
): StrictableB<B>;

/** C: `initTrpc` with `strict: true`, whose base procedure is strict. */
export declare function initTrpcC<TConfig extends RootConfig = {}>(
  opts: RootOptions<TConfig['meta'] extends object ? TConfig['meta'] : {}> & {
    strict: true;
  },
): Omit<
  TrpcRoot<
    TConfig['ctx'] extends object ? TConfig['ctx'] : {},
    TConfig['meta'] extends object ? TConfig['meta'] : {}
  >,
  'procedure'
> & {
  procedure: StrictBuilderB<
    Marked<
      DefOf<
        TrpcRoot<
          TConfig['ctx'] extends object ? TConfig['ctx'] : {},
          TConfig['meta'] extends object ? TConfig['meta'] : {}
        >['procedure']
      >
    >
  >;
};
