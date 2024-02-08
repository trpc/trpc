import type { Resolver } from '@trpc/client';
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
> = TType extends 'query'
  ? {
      query: Resolver<TDef>;
      revalidate: (
        input?: TDef['input'],
      ) => Promise<
        { revalidated: false; error: string } | { revalidated: true }
      >;
    }
  : TType extends 'mutation'
  ? {
      mutate: Resolver<TDef>;
    }
  : TType extends 'subscription'
  ? {
      subscribe: Resolver<TDef>;
    }
  : never;

export type NextAppDirDecorateRouterRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? NextAppDirDecorateRouterRecord<TRoot, $Value>
      : $Value extends AnyProcedure
      ? DecorateProcedureServer<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            errorShape: TRoot['errorShape'];
            transformer: TRoot['transformer'];
          }
        >
      : never
    : never;
};
