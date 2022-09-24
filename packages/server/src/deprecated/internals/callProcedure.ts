import { Observable } from '../../observable';
import { AnyRouter, ProcedureType } from '../router';

/**
 * @deprecated
 */
export async function callProcedure<
  TRouter extends AnyRouter<TContext>,
  TContext extends Record<string, any>,
>(opts: {
  path: string;
  input: unknown;
  router: TRouter;
  ctx: TContext;
  type: ProcedureType;
}): Promise<unknown | Observable<TRouter, any>> {
  const { type, path, input } = opts;

  const caller = opts.router.createCaller(opts.ctx);
  if (type === 'query') {
    return caller.query(path, input as any);
  }
  if (type === 'mutation') {
    return caller.mutation(path, input as any);
  }
  if (type === 'subscription') {
    const sub = (await caller.subscription(path, input as any)) as Observable<
      any,
      any
    >;
    return sub;
  }
  /* istanbul ignore next */
  throw new Error(`Unknown procedure type ${type}`);
}
