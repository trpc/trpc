import { ZodRPCRouter, ZodRPCError, ZodRPCErrorCode } from '../internal';
import { generateSDK } from './sdk';

// /////////////////////
// /////  API DEF  /////
// /////////////////////

export type ApiDef = {
  // uri: string;
  router: ZodRPCRouter;
};

export type ApiDefInput = {
  // uri: string;
  router?: ZodRPCRouter;
};

// type GetContextType<D extends ApiDef> = D['getContext'] extends (arg: any) => infer U
//   ? U extends Promise<infer Y>
//     ? Y
//     : U
//   : unknown;

// type ApiDefInput = Omit<ApiDef, 'router'>;

export type SDKHandler = (url: string, payload: { endpoint: string[]; args: unknown[] }) => Promise<unknown>;
export type SDKParams = { url: string; handler: SDKHandler };

export class ZodRPCApi<Router extends ZodRPCRouter<any, any>> {
  readonly router: Router;

  constructor(router: Router) {
    this.router = router;
  }

  static create = <R extends ZodRPCRouter<any, any>>(router: R): ZodRPCApi<R> => {
    return new ZodRPCApi(router);
  };

  // get root() {
  //   return this._def.router;
  // }

  // endpoint = this.root.endpoint

  // compose = this._def.router.compose;
  // endpoint = this._def.router.endpoint;
  // handle = this._def.router.handle;

  to = {
    express: () => async (request: any, response: any, next: any) => {
      try {
        if (request.method !== 'POST') {
          throw new ZodRPCError(400, ZodRPCErrorCode.InvalidMethod, 'Skii RPC APIs only accept post requests');
        }

        const result = await this.router.handle(request.body);
        response.status(200).send(result);
        next();
      } catch (_err) {
        const err: ZodRPCError = _err;
        console.log(`Caught error`);
        console.log(err.message);
        console.log(err);
        return response.status(err.code || 500).send(`${err.message}`);
      }
    },
    sdk: (params: SDKParams): ReturnType<Router['_sdk']> => this.router._sdk(params) as any,
    //  sdk: (params: SDKParams):ReturnType<Router['_sdk']> => {
    //    return this.router._sdk(params,[]) as any;
    //  const rootRouter = this.router;

    //  class ZodSDK<Router extends ZodRPCRouter<any, any>> {
    //    params: SDKParams;
    //    readonly _router!: Router;

    //    constructor(_router: Router, params: SDKParams) {

    //      this.params = params;
    //    }

    //    get call(): ReturnType<Router['_sdk']> {return rootRouter._sdk(params) as any;};
    //  }

    //  return new ZodSDK(rootRouter, params);
    //  },
    sdkFile: async () => {
      // const fs = await import('fs');
      // console.log(location);
      const generatedSDK = generateSDK(this, 'http://localhost:3000/rpc');
      return generatedSDK;
      // fs.writeFileSync(`${location}`, generatedSDK, 'utf8');
    },
  };
}
