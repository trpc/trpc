import type { Resolver } from '@trpc/client';
import type { ClientContext } from '@trpc/client/internals/types';
import type {
  AnyProcedure,
  AnyRootTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  ProcedureType,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';

type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

export type DecorateProcedureServer<
  TType extends ProcedureType,
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = TType extends 'query'
  ? {
      query: Resolver<TDef, TContext>;
      revalidate: (
        input?: TDef['input'],
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TType extends 'mutation'
    ? {
        mutate: Resolver<TDef, TContext>;
      }
    : TType extends 'subscription'
      ? {
          subscribe: Resolver<TDef, TContext>;
        }
      : never;

export type NextAppDirDecorateRouterRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
  TContext extends ClientContext,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedureServer<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            errorShape: TRoot['errorShape'];
            transformer: TRoot['transformer'];
          },
          TContext
        >
      : $Value extends RouterRecord
        ? NextAppDirDecorateRouterRecord<TRoot, $Value, TContext>
        : never
    : never;
};
