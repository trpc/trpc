import { TRPCEndpoint, TRPCErrorCode, TRPCError } from '../internal';
import { tsutil } from '../util/tsutil';

export type TRPCPayload = { path: string[]; args: any[]; context: any };
// export type ClientSDKHandler = (url: string, payload: { path: string[]; args: unknown[] }) => Promise<unknown>;
// export type ToClientSDKParams = { url: string; getContext: () => Promise<any>; handler: ClientSDKHandler };

export class TRPCRouter<
  Children extends { [k: string]: TRPCRouter<any, any> } = {},
  Endpoints extends { [k: string]: TRPCEndpoint<any> } = {}
> {
  readonly _def: { children: Children; endpoints: Endpoints };
  readonly _sdk!: tsutil.format<
    { [k in keyof Children]: Children[k]['_sdk'] } &
      { [k in keyof Endpoints]: Endpoints[k]['_sdk'] }
  >;

  constructor(def: { children: Children; endpoints: Endpoints }) {
    this._def = def;
  }

  endpoint: <P extends string, E extends TRPCEndpoint<any>>(
    path: P,
    endpt: E,
  ) => TRPCRouter<Children, tsutil.format<Endpoints & { [k in P]: E }>> = (
    path,
    endpt,
  ) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new TRPCError(
        500,
        TRPCErrorCode.NameConflict,
        `Name conflict: "${path}" already in use`,
      );
    return new TRPCRouter({
      children: this._def.children,
      endpoints: { ...this._def.endpoints, [path]: endpt },
    }) as any;
  };

  compose: <P extends string, R extends TRPCRouter>(
    path: P,
    child: R,
  ) => TRPCRouter<tsutil.format<Children & { [k in P]: R }>, Endpoints> = (
    path,
    child,
  ) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new TRPCError(
        500,
        TRPCErrorCode.NameConflict,
        `Name conflict: "${path}" already in use`,
      );

    return new TRPCRouter({
      children: { ...this._def.children, [path]: child },
      endpoints: this._def.endpoints,
    }) as any;
  };

  handle: (payload: TRPCPayload) => any = async (payload) => {
    console.log(JSON.stringify(payload, null, 2));
    if (!payload) {
      throw new TRPCError(
        500,
        TRPCErrorCode.InvalidEndpoint,
        `No body received in post request.\nMake sure you've configured a body parser middleware.`,
      );
    }

    const { path, args, context } = payload;

    if (!Array.isArray(path) || !path.every((x) => typeof x === 'string')) {
      throw new TRPCError(
        400,
        TRPCErrorCode.InvalidEndpoint,
        'body.endpoint should be array of strings.',
      );
    }

    if (!Array.isArray(args)) {
      throw new TRPCError(
        400,
        TRPCErrorCode.InvalidArguments,
        'body.args should be an array.',
      );
    }

    if (!path || path.length === 0)
      throw new TRPCError(400, TRPCErrorCode.InvalidEndpoint, 'Path is empty');

    const segment = path[0];
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
      throw new TRPCError(
        501,
        TRPCErrorCode.EndpointNotFound,
        `Endpoint not found: "${segment}"`,
      );

    if (maybeChild) {
      if (path.length < 2) {
        throw new TRPCError(
          501,
          TRPCErrorCode.InvalidPath,
          `Endpoint path must terminate with an endpoint, not a child router`,
        );
      }
      return await maybeChild.handle({ path: path.slice(1), args, context });
    }

    const handler = maybeEndpoint;
    if (!(handler instanceof TRPCEndpoint)) {
      throw new TRPCError(
        500,
        TRPCErrorCode.InvalidEndpoint,
        `Invalid endpoint at "${segment}".`,
      );
    }

    let isAuthorized;
    try {
      isAuthorized = await handler._def.authorize(context)(...args);
    } catch (err) {
      throw new TRPCError(500, TRPCErrorCode.AuthorizationError, err.message);
    }
    if (!isAuthorized) {
      throw new TRPCError(403, TRPCErrorCode.NotAuthorized, 'Access denied.');
    }

    try {
      const value = await handler.call(context, ...args);
      return value;
    } catch (err) {
      throw new TRPCError(500, TRPCErrorCode.UnknownError, err.message);
    }
  };

  static create = (): TRPCRouter => {
    return new TRPCRouter({ endpoints: {}, children: {} });
  };

  toExpress = () => async (request: any, response: any, next: any) => {
    try {
      if (request.method !== 'POST') {
        throw new TRPCError(
          400,
          TRPCErrorCode.InvalidMethod,
          'Skii RPC APIs only accept post requests',
        );
      }

      const result = await this.handle(request.body);
      response.status(200).json(result);
      if (next) next();
    } catch (_err) {
      const err: TRPCError = _err;
      console.log(err.code);
      console.log(err.type);
      console.log(err.message);
      return response
        .status(err.code || 500)
        .send(`${err.type}: ${err.message}`);
    }
  };

  toServerSDK: () => tsutil.format<
    { [k in keyof Children]: ReturnType<Children[k]['toServerSDK']> } &
      { [k in keyof Endpoints]: ReturnType<Endpoints[k]['_toServerSDK']> }
  > = () => {
    const sdkObject: any = {};

    for (const name in this._def.children) {
      sdkObject[name] = this._def.children[name].toServerSDK();
    }
    for (const name in this._def.endpoints) {
      sdkObject[name] = this._def.endpoints[name]._toServerSDK();
    }
    return sdkObject;
  };
}
