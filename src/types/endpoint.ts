import { SDKParams } from './api';
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

export type TRPCEndpointDef<Func extends AnyFunc> = {
  implement: Func;
  authorize: (args: Parameters<Func>) => boolean | Promise<boolean>;
};

// type Authorize<Func extends AnyFunc> = (args: Parameters<Func>, ctx: unknown) => boolean | Promise<boolean>;

export class TRPCEndpoint<Func extends AnyFunc> {
  readonly _def!: TRPCEndpointDef<Func>;

  constructor(def: TRPCEndpointDef<Func>) {
    this._def = def;
  }

  static create = <F extends AnyFunc>(func: F): TRPCEndpoint<F> => {
    return new TRPCEndpoint({ implement: func, authorize: () => false });
  };

  call = (...args: Parameters<Func>): ReturnType<Func> => {
    return this._def.implement(...args);
  };

  authorize = (func: (args: Parameters<Func>) => boolean | Promise<boolean>): this => {
    return new TRPCEndpoint({ ...this._def, authorize: func }) as any;
  };

  _toClientSDK: (
    params: SDKParams,
    path: string[],
  ) => Func extends (a: any, ...b: infer U) => any ? tsutil.promisify<(...args: U) => ReturnType<Func>> : never = (
    params,
    path,
  ) => {
    return (async (...args: any) => {
      const result = await params.handler(params.url, { endpoint: path, args });
      return result as any;
    }) as any;
  };

  _toServerSDK: () => tsutil.promisify<Func> = () => {
    return (async (...args: any) => {
      const result = await this.call(...args);
      return result as any;
    }) as any;
  };
}
