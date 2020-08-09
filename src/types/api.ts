import { TRPCRouter, TRPCError, TRPCErrorCode } from '../internal';

export type ApiDef = {
  router: TRPCRouter;
};

export type ApiDefInput = {
  router?: TRPCRouter;
};

export type SDKHandler = (url: string, payload: { endpoint: string[]; args: unknown[] }) => Promise<unknown>;
export type SDKParams = { url: string; handler: SDKHandler };

export class TRPCApi<R extends TRPCRouter<any, any>> {
  readonly router: R;

  constructor(router: R) {
    this.router = router;
  }

  static create = <R extends TRPCRouter<any, any>>(router: R): TRPCApi<R> => {
    return new TRPCApi(router);
  };

  toExpress = () => async (request: any, response: any, next: any) => {
    try {
      if (request.method !== 'POST') {
        throw new TRPCError(400, TRPCErrorCode.InvalidMethod, 'Skii RPC APIs only accept post requests');
      }

      const result = await this.router.handle(request.body);
      response.status(200).send(`${result}`);
      next();
    } catch (_err) {
      const err: TRPCError = _err;
      return response.status(err.code || 500).send(`${err.type}: ${err.message}`);
    }
  };

  toClientSDK = (params: SDKParams): ReturnType<R['_toClientSDK']> => this.router._toClientSDK(params) as any;
  toServerSDK = (): ReturnType<R['_toServerSDK']> => this.router._toServerSDK() as any;
  handle = this.router.handle;
}
