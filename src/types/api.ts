import { ZodRPCRouter, ZodRPCError, ZodRPCErrorCode } from '../internal';
import { generateSDK } from './sdk';

// /////////////////////
// /////  API DEF  /////
// /////////////////////

export type ApiDef = {
  uri: string;
  router: ZodRPCRouter;
};

export type ApiDefInput = {
  uri: string;
  router?: ZodRPCRouter;
};

// type GetContextType<D extends ApiDef> = D['getContext'] extends (arg: any) => infer U
//   ? U extends Promise<infer Y>
//     ? Y
//     : U
//   : unknown;

// type ApiDefInput = Omit<ApiDef, 'router'>;

export class ZodRPCApi<D extends ApiDef = ApiDef> {
  readonly _def!: D;
  // readonly META!: { ctx: GetContextType<D> };

  constructor(def: ApiDefInput) {
    this._def = { ...def, router: def.router || ZodRPCRouter.create() } as any;
  }

  static create = <D extends ApiDefInput>(
    def: D,
  ): ZodRPCApi<D & { router: ZodRPCRouter<{ children: {}; endpoints: {} }> }> => {
    return new ZodRPCApi(def);
  };

  get root() {
    return this._def.router;
  }

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

        const result = await this._def.router.handle(request.body);
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

    sdk: async () => {
      // const fs = await import('fs');
      // console.log(location);
      const generatedSDK = generateSDK(this);
      return generatedSDK;
      // fs.writeFileSync(`${location}`, generatedSDK, 'utf8');
    },
  };
}
