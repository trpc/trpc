/**
 * Types that inferred procedure, router and client types refer to
 * (`@trpc12/trpc/internal`). They are exported only so declaration emit can name
 * them (TS2742, TS2883); don't build on them. No semver guarantees.
 *
 * @module
 */
export type {
  BuilderDef,
  BuilderInternals,
  ConcatCheck,
  ConcatOutputCheck,
  CurrentCtx,
  InputDef,
  OutputCheck,
  ShortsCheck,
  Split,
  SplitReturn,
  SplitStream,
  StrictErrors,
  With,
  ExactRouter,
  ImplementedProcedure,
  ImplementerDef,
  ImplementerMethods,
  UndeclaredCheck,
  EffectBodyCheck,
  EffectMiddlewareFactory,
  MiddlewareErrors,
  ReqCtx,
  ReqInput,
  ReqMeta,
  Step,
  LazyDef,
} from '../server/procedures/index.ts';
export type { DeclContext } from '../client/link.ts';
export type { NoLinkCarries } from '../client/types.ts';
export type { Unset } from './types.ts';
