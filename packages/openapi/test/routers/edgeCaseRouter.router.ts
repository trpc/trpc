import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

// ---------- Edge case types ----------

// Intersection with disjoint anonymous properties (should merge into single object)
type DisjointIntersection = { name: string } & { age: number };

// Intersection with conflicting anonymous property types (should use allOf)
type ConflictingIntersection = { id: string; label: string } & {
  id: number;
  extra: boolean;
};

// BigInt type
type WithBigInt = {
  id: bigint;
};

// Never type
type NeverField = {
  valid: string;
  impossible?: never;
};

// Promise return type (should unwrap)
type AsyncResult = Promise<{ data: string }>;

// Subscription (should be skipped in OpenAPI)
// Empty object input

type WithFunctions = {
  id: string;
  onEvent: (value: string) => void;
  optionalHook?: (value: number) => number;
  ctor: new () => { x: number };
};

type OnlyFunctions = {
  run: () => void;
};

type StandardFunctionInterfaces = {
  id: string;
  handler: Function;
  callable: CallableFunction;
  newable: NewableFunction;
  optionalHandler?: Function;
  nullableHandler: Function | null;
};

type FunctionUnionTarget = {
  label: string;
};

type FunctionUnion = {
  id: string;
  value: Function | FunctionUnionTarget | null;
  inline: (() => void) | FunctionUnionTarget;
};

type NullableFunction = {
  id: string;
  hook: (() => void) | null;
  maybeHook?: (() => void) | null;
};

export const EdgeCaseRouter = t.router({
  // --- BigInt type ---
  bigint: t.procedure.query((): WithBigInt => ({
    id: BigInt(123),
  })),

  // --- Never field ---
  neverField: t.procedure.query((): NeverField => ({
    valid: 'hello',
  })),

  // --- Promise return (should unwrap) ---
  asyncReturn: t.procedure.query(async (): AsyncResult => ({
    data: 'async result',
  })),

  // --- Empty input (void-like) ---
  voidInput: t.procedure.query(() => 'no input needed'),

  // --- Undefined input ---
  undefinedInput: t.procedure
    .input(z.undefined())
    .query(() => 'undefined input'),

  // --- Void input ---
  voidExplicit: t.procedure.input(z.void()).query(() => 'void input'),

  // --- Subscription (should be excluded from OpenAPI) ---
  sub: t.procedure.subscription(async function* () {
    yield 'data';
  }),

  // --- Default options (no title/version) ---
  simpleQuery: t.procedure.query(() => 42),

  // --- Deeply nested router ---
  level1: t.router({
    level2: t.router({
      level3: t.router({
        deep: t.procedure.query(() => 'deep'),
      }),
    }),
  }),

  // --- Boolean-only union (true | false should collapse to boolean) ---
  boolUnion: t.procedure.query(() => {
    const val = true as true | false;
    return { flag: val };
  }),

  // --- Boolean | null ---
  boolNullable: t.procedure.query(() => {
    const val = true as boolean | null;
    return { flag: val };
  }),

  // --- Null-only return ---
  nullOnly: t.procedure.query(() => null),

  // --- Uint8Array / Buffer ---
  binary: t.procedure.query((): { data: Uint8Array } => ({
    data: new Uint8Array([1, 2, 3]),
  })),

  // --- Nullable object ---
  nullableObject: t.procedure.query(() => {
    const val = null as { id: number; name: string } | null;
    return val;
  }),

  // --- Mutation with no input ---
  noInputMutation: t.procedure.mutation(() => ({ success: true })),

  // --- Intersection with disjoint properties (merged into single object) ---
  disjointIntersection: t.procedure.query((): DisjointIntersection => ({
    name: 'Alice',
    age: 30,
  })),

  // --- Intersection with conflicting property types (allOf) ---
  conflictingIntersection: t.procedure.query(
    () =>
      ({
        id: 1,
        label: 'test',
        extra: true,
      }) as ConflictingIntersection,
  ),

  // --- Query with complex nullable union ---
  complexNullable: t.procedure.query(() => {
    const val = null as string | number | null;
    return { value: val };
  }),

  // --- Computed literal property name ---
  literalComputedKey: t.procedure.query((): { ['x-trace-id']: string } => ({
    ['x-trace-id']: 'trace-123',
  })),

  withFunctions: t.procedure.query((): WithFunctions => ({
    id: 'with-functions',
    onEvent: () => undefined,
    optionalHook: (value) => value,
    ctor: class {
      x = 0;
    },
  })),

  onlyFunctions: t.procedure.query((): OnlyFunctions => ({
    run: () => undefined,
  })),

  standardFunctionInterfaces: t.procedure.query(
    (): StandardFunctionInterfaces => ({
      id: 'standard-function-interfaces',
      handler: () => undefined,
      callable: () => undefined,
      newable: class {},
      optionalHandler: () => undefined,
      nullableHandler: null,
    }),
  ),

  topLevelFunction: t.procedure.query((): Function => () => undefined),

  functionUnion: t.procedure.query((): FunctionUnion => ({
    id: 'function-union',
    value: { label: 'x' },
    inline: { label: 'y' },
  })),

  nullableFunction: t.procedure.query((): NullableFunction => ({
    id: 'nullable-function',
    hook: null,
  })),
});

export type EdgeCaseRouter = typeof EdgeCaseRouter;
