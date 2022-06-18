import { defaultFormatter } from '../../error/formatter';
import { CombinedDataTransformer, defaultTransformer } from '../../transformer';
import {
  AnyRouter,
  ProcedureStructure,
  Router,
  createRouterFactory,
  mergeProcedureRecordsVariadic,
} from '../router';
import { RootConfig } from './config';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';

type EnsureProcedureStructure<T> = T extends Partial<ProcedureStructure>
  ? {
      queries: T['queries'];
      mutations: T['mutations'];
      subscriptions: T['subscriptions'];
    }
  : never;
type CreateNewRouter<
  TMain extends AnyRouter,
  TChildren extends AnyRouter[],
> = Router<{
  _ctx: TMain['_def']['_ctx'];
  _errorShape: TMain['_def']['_errorShape'];
  _meta: TMain['_def']['_meta'];
  transformer: TMain['_def']['transformer'];
  errorFormatter: TMain['errorFormatter'];
  queries: EnsureProcedureStructure<
    mergeProcedureRecordsVariadic<[TMain, ...TChildren]>
  >['queries'];
  mutations: EnsureProcedureStructure<
    mergeProcedureRecordsVariadic<[TMain, ...TChildren]>
  >['mutations'];
  subscriptions: EnsureProcedureStructure<
    mergeProcedureRecordsVariadic<[TMain, ...TChildren]>
  >['subscriptions'];
}>;

function mergeRouters<
  TConfig extends RootConfig,
  TMain extends AnyRouter,
  TChildren extends AnyRouter[],
>(mainRouter: TMain, ..._routerList: TChildren) {
  const routerList = [mainRouter, ..._routerList];

  const queries = mergeWithoutOverrides(
    {},
    ...routerList.map((r) => r.queries),
  );
  const mutations = mergeWithoutOverrides(
    {},
    ...routerList.map((r) => r.mutations),
  );
  const subscriptions = mergeWithoutOverrides(
    {},
    ...routerList.map((r) => r.subscriptions),
  );
  const errorFormatter = routerList.reduce(
    (currentErrorFormatter, nextRouter) => {
      if (
        nextRouter.errorFormatter &&
        nextRouter.errorFormatter !== defaultFormatter
      ) {
        if (
          currentErrorFormatter !== defaultFormatter &&
          currentErrorFormatter !== nextRouter.errorFormatter
        ) {
          throw new Error('You seem to have several error formatters');
        }
        return nextRouter.errorFormatter;
      }
      return currentErrorFormatter;
    },
    defaultFormatter,
  );

  const transformer = routerList.reduce((prev, current) => {
    if (current.transformer && current.transformer !== defaultTransformer) {
      if (prev !== defaultTransformer && prev !== current.transformer) {
        throw new Error('You seem to have several transformers');
      }
      return current.transformer;
    }
    return prev;
  }, defaultTransformer as CombinedDataTransformer);

  const router = createRouterFactory<TConfig>({
    errorFormatter,
    transformer,
  })({
    queries,
    mutations,
    subscriptions,
  });
  return router;
}
/**
 * @internal
 */
export function mergeRoutersFactory<TConfig extends RootConfig>() {
  return function mergeRoutersInner<
    TMain extends AnyRouter,
    TChildren extends AnyRouter[],
  >(
    mainRouter: TMain,
    ..._routerList: TChildren
  ): CreateNewRouter<TMain, TChildren> {
    return mergeRouters<TConfig, TMain, TChildren>(mainRouter, ..._routerList);
  };
}
