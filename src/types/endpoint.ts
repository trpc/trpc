// import { ToClientSDKParams } from './router';
import { tsutil } from '../util/tsutil';

////////////////////////////
/////   ENDPOINT DEF   /////
////////////////////////////

// export const and = <T extends (...callbacks: any[]) => any>(...callbacks: T[]) => async (
//   ..._args: Parameters<T>
// ): Promise<ReturnType<T>> => {
//   const values = await Promise.all(callbacks);
//   for (const v of values) {
//     if (!v) return false as any;
//   }
//   return true as any;
// };
type AnyFunc = (...args: any[]) => any;
type WrappedFunc = (ctx: any) => (...args: any[]) => any;

export type TRPCEndpointDef<Func extends WrappedFunc> = {
  implement: Func;
  authorize: (
    ctx: any,
  ) => (...args: Parameters<ReturnType<Func>>) => boolean | Promise<boolean>;
};

// type Authorize<Func extends AnyFunc> = (args: Parameters<Func>, ctx: unknown) => boolean | Promise<boolean>;

export class TRPCEndpoint<Func extends AnyFunc> {
  readonly _def!: TRPCEndpointDef<Func>;
  readonly _sdk!: Func extends (ctx: any) => (...args: infer U) => any
    ? tsutil.returnPromisify<(...args: U) => ReturnType<ReturnType<Func>>>
    : never;

  constructor(def: TRPCEndpointDef<Func>) {
    this._def = def;
  }

  static create = <F extends WrappedFunc>(func: F): TRPCEndpoint<F> => {
    return new TRPCEndpoint({ implement: func, authorize: () => () => false });
  };

  call = (
    ctx: Parameters<Func>[0],
    ...args: Parameters<ReturnType<Func>>
  ): ReturnType<ReturnType<Func>> => {
    return this._def.implement(ctx)(...args);
  };

  authorize = (
    func: (
      ctx: Parameters<Func>[0],
    ) => (...args: Parameters<ReturnType<Func>>) => boolean | Promise<boolean>,
  ): this => {
    return new TRPCEndpoint({ ...this._def, authorize: func }) as any;
  };

  _toServerSDK = () => this.call;
}
