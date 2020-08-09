import { TRPCEndpoint, TRPCErrorCode, TRPCError } from '../internal';
import { SDKParams } from './api';
import { tsutil } from '../util/tsutil';

export type TRPCPayload = { endpoint: string[]; args: any[]; context: { [k: string]: unknown } };
export class TRPCRouter<
  Children extends { [k: string]: TRPCRouter<any, any> } = {},
  Endpoints extends { [k: string]: TRPCEndpoint<any> } = {}
> {
  readonly _def: { children: Children; endpoints: Endpoints };
  constructor(def: { children: Children; endpoints: Endpoints }) {
    this._def = def;
  }

  endpoint: <P extends string, E extends TRPCEndpoint<any>>(
    path: P,
    endpt: E,
  ) => TRPCRouter<Children, tsutil.format<Endpoints & { [k in P]: E }>> = (path, endpt) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new TRPCError(500, TRPCErrorCode.NameConflict, `Name conflict: "${path}" already in use`);
    return new TRPCRouter({
      children: this._def.children,
      endpoints: { ...this._def.endpoints, [path]: endpt },
    });
  };

  compose: <P extends string, R extends TRPCRouter>(
    path: P,
    child: R,
  ) => TRPCRouter<tsutil.format<Children & { [k in P]: R }>, Endpoints> = (path, child) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new TRPCError(500, TRPCErrorCode.NameConflict, `Name conflict: "${path}" already in use`);

    return new TRPCRouter({
      children: { ...this._def.children, [path]: child },
      endpoints: this._def.endpoints,
    });
  };

  handle: (payload: TRPCPayload) => any = async (payload) => {
    if (!payload) {
      throw new TRPCError(
        500,
        TRPCErrorCode.InvalidEndpoint,
        `No body received in post request.\nMake sure you've configured a body parser middleware.`,
      );
    }

    const { endpoint, args, context } = payload;

    if (!Array.isArray(endpoint) || !endpoint.every((x) => typeof x === 'string')) {
      throw new TRPCError(400, TRPCErrorCode.InvalidEndpoint, 'body.endpoint should be array of strings.');
    }

    if (!Array.isArray(args)) {
      throw new TRPCError(400, TRPCErrorCode.InvalidArguments, 'body.args should be an array.');
    }

    if (!endpoint || endpoint.length === 0) throw new TRPCError(400, TRPCErrorCode.InvalidEndpoint, 'InvalidEndpoint');

    const segment = endpoint[0];
    if (typeof segment !== 'string')
      throw new TRPCError(
        400,
        TRPCErrorCode.InvalidEndpoint,
        `Endpoint segment is of non-string type: ${typeof segment}`,
      );

    const maybeEndpoint = this._def.endpoints[segment];
    const maybeChild = this._def.children[segment];
    if (maybeEndpoint && maybeChild)
      throw new TRPCError(
        500,
        TRPCErrorCode.NameConflict,
        `Naming conflict. Endpoint and subrouter share path "${segment}"`,
      );

    if (!maybeEndpoint && !maybeChild)
      throw new TRPCError(501, TRPCErrorCode.EndpointNotFound, `Endpoint not found: "${segment}"`);

    if (maybeChild) {
      if (endpoint.length < 2) {
        throw new TRPCError(
          501,
          TRPCErrorCode.InvalidPath,
          `Endpoint path must terminate with an endpoint, not a child router`,
        );
      }
      return await maybeChild.handle({ endpoint: endpoint.slice(1), args, context });
    }

    const handler = maybeEndpoint;
    if (!(handler instanceof TRPCEndpoint)) {
      throw new TRPCError(500, TRPCErrorCode.InvalidEndpoint, `Invalid endpoint at "${segment}".`);
    }

    let isAuthorized;
    try {
      isAuthorized = await handler._def.authorization(args, context);
    } catch (err) {
      throw new TRPCError(500, TRPCErrorCode.AuthorizationError, err.message);
    }
    if (!isAuthorized) {
      throw new TRPCError(403, TRPCErrorCode.NotAuthorized, 'Access denied.');
    }

    try {
      const value = await handler._def.function(...args);
      return value;
    } catch (err) {
      throw new TRPCError(500, TRPCErrorCode.UnknownError, err.message);
    }
  };

  static create = (): TRPCRouter => {
    return new TRPCRouter({ endpoints: {}, children: {} });
  };

  _toClientSDK: (
    params: SDKParams,
    path?: string[],
  ) => tsutil.format<
    { [k in keyof Children]: ReturnType<Children[k]['_toClientSDK']> } &
      { [k in keyof Endpoints]: ReturnType<Endpoints[k]['_toClientSDK']> }
  > = (params, path = []) => {
    const sdkObject: any = {};

    for (const name in this._def.children) {
      sdkObject[name] = this._def.children[name]._toClientSDK(params, [...path, name]);
    }
    for (const name in this._def.endpoints) {
      sdkObject[name] = this._def.endpoints[name]._toClientSDK(params, [...path, name]);
    }
    return sdkObject;
  };

  _toServerSDK: () => tsutil.format<
    { [k in keyof Children]: ReturnType<Children[k]['_toServerSDK']> } &
      { [k in keyof Endpoints]: ReturnType<Endpoints[k]['_toServerSDK']> }
  > = () => {
    const sdkObject: any = {};

    for (const name in this._def.children) {
      sdkObject[name] = this._def.children[name]._toServerSDK();
    }
    for (const name in this._def.endpoints) {
      sdkObject[name] = this._def.endpoints[name]._toServerSDK();
    }
    return sdkObject;
  };
}
