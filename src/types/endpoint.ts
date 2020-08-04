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
  function: Func;
  authorization: (args: Parameters<Func>, ctx: unknown) => boolean | Promise<boolean>;
};

export class TRPCEndpoint<Func extends AnyFunc> {
  readonly _def!: TRPCEndpointDef<Func>;

  constructor(def: TRPCEndpointDef<Func>) {
    this._def = def;
  }

  static create = <F extends AnyFunc>(func: F) => {
    return new TRPCEndpoint({ function: func, authorization: () => false });
  };

  call = (...args: Parameters<Func>): ReturnType<Func> => {
    return this._def.function(...args);
  };

  authorize = (authorization: (args: Parameters<Func>, ctx: any) => boolean | Promise<boolean>): this => {
    return new TRPCEndpoint({ ...this._def, authorization }) as any;
  };

  _sdk: (params: SDKParams, path: string[]) => tsutil.promisify<Func> = (params, path) => {
    return (async (...args: any) => {
      const result = await params.handler(params.url, { endpoint: path, args });
      return result as any;
    }) as any;
  };
}
