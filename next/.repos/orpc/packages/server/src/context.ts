import type { DistributiveOmit } from '@orpc/shared'

export interface Context {
  [key: PropertyKey]: any
}

export type MergedInitialContext<
  TInitial extends Context,
  TOutContext extends Context,
  TInContext extends Context,
> = TInContext extends any
  ? Exclude<keyof TInContext, keyof TInitial | keyof TOutContext> extends never
    ? TInitial
    : TInitial & DistributiveOmit<TInContext, keyof TInitial | keyof TOutContext>
  : never

export type MergedContext<
  TCurrent extends Context,
  TOutContext extends Context,
> = keyof TOutContext extends never
  ? TCurrent
  : DistributiveOmit<TCurrent, keyof TOutContext> & TOutContext
