import * as z from 'zod';
import { SDKParams } from './api';
import { promisify } from '../util/tsutil';

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

export type EndpointDef<T extends z.ZodFunction<any, any> = z.ZodFunction<any, any>> = {
  function: T;
  implementation: T['_type'];
  authorization: (args: Parameters<T['_type']>) => boolean | Promise<boolean>;
};

// export type EndpointDef<T extends z.ZodFunction<any, any> = z.ZodFunction<any, any>> = Required<EndpointDefInput<T>>;

export type EndpointDefDefault = EndpointDef<z.ZodFunction<z.ZodTuple<[]>, z.ZodVoid>>;
// export type genericAuthorizer = (...args: any) => Promise<boolean>;
// export type authorizer<D extends EndpointDef> = (...args: D['function']['_def']['args']['_type']) => Promise<boolean>;

// export class ZodRPCFunctionEndpoint<
//          Inputs extends z.ZodTuple,
//          Output extends z.ZodType<any, any>
//        > extends z.ZodFunction<Inputs, Output> {
//          implementation: this['_type'] = (() => {
//            throw new Error('Endpoint not implemented') as any;
//          }) as any;
//          authorization: (...args: T['_def']['args']['_type']) => boolean | Promise<boolean> = () => false;

//          constructor(def:z.ZodFunction<Inputs,Output>['_def'], asdf:this['_type']){
//            super(def);

//          }
//          authorize = (authorization: D['authorization']): ZodRPCEndpoint<D> => {
//            return new ZodRPCFunctionEndpoint({
//              ...this._def,
//              authorization,
//            });
//          };
//        }

export class ZodRPCEndpoint<D extends EndpointDef = EndpointDef> {
  readonly _def!: D;
  // readonly implementation: D['function']['_type'] = () => {
  //   throw new Error('Endpoint not implemented');
  // };
  // readonly authorization: (...args: any) => Promise<boolean> = () => Promise.resolve(false);

  constructor(def: D) {
    this._def = def;
  }

  args = <Inputs extends [z.Schema<any, any>, ...z.Schema<any, any>[]]>(
    ...inputs: Inputs
  ): ZodRPCEndpoint<
    Omit<D, 'function'> & { function: z.ZodFunction<z.ZodTuple<Inputs>, ReturnType<D['function']['_type']>> }
  > => {
    return new ZodRPCEndpoint({
      ...this._def,
      function: this._def.function.args(...inputs),
    }) as any;
  };

  returns = <Output extends z.ZodType<any>>(
    returnType: Output,
  ): ZodRPCEndpoint<
    Omit<D, 'function'> & {
      function: z.ZodFunction<D['function']['_def']['args'], Output>;
    }
  > => {
    // const asdf = this._def.function.returns(returnType);
    return new ZodRPCEndpoint({
      ...this._def,
      function: this._def.function.returns(returnType),
    }) as any;
  };

  implement = (implementation: D['function']['_type']) => {
    const wrapped = this._def.function.parse(implementation);
    return new ZodRPCEndpoint({
      ...this._def,
      implementation: wrapped,
    });
  };

  call = (...args: Parameters<D['function']['_type']>): ReturnType<D['function']['_type']> => {
    return this._def.implementation(...args);
  };
  //  wrap = (...args:Parameters<D['func']['wrap']>)=>{
  //   this._def.implementation = this._def.func.wrap(...(args as [any]));
  //  }

  authorize = (
    authorizer: (args: Parameters<D['function']['_type']>) => boolean | Promise<boolean>,
  ): ZodRPCEndpoint<D> => {
    return new ZodRPCEndpoint({
      ...this._def,
      authorization: authorizer,
    });
  };

  test = (f: ((x: string) => boolean) & ThisType<{ asdf: string }>) => {
    console.log(f);
    return this;
  };

  _sdk: (params: SDKParams, path: string[]) => promisify<this['_def']['function']['_type']> = (params, path) => {
    return (async (...args: any) => {
      const result = await params.handler(params.url, { endpoint: path, args });
      return result as any;
    }) as any;
  };

  static create = (): ZodRPCEndpoint<EndpointDefDefault> => {
    const defaultImpl = () => {
      throw new Error('Endpoint not implemented');
    };
    const defaultAuth = () => Promise.resolve(false);
    return new ZodRPCEndpoint({
      function: z.function(),
      implementation: defaultImpl,
      authorization: defaultAuth,
    }) as any;
  };

  //  static mame = (): ZodRPCEndpoint<{ function: V; authorize: () => Promise<false> }> => {
  //    return new ZodRPCEndpoint({
  //      function: funcValue,
  //      authorize: () => {
  //        console.warn(
  //          `You must call .authorize() on your endpoints. Otherwise all requests will be rejected with .`,
  //        );
  //        return Promise.resolve(false);
  //      },
  //    });
  //  };
}
