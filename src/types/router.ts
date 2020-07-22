import * as z from 'zod';
import { ZodRPCEndpoint, ZodRPCErrorCode, ZodRPCError } from '../internal';

export type RouterDef = {
  children: { [k: string]: ZodRPCRouter };
  endpoints: { [k: string]: ZodRPCEndpoint };
};

// type RouterDefInput = Partial<RouterDef>;
// type addEndpoint<D extends RouterDef, Path extends string, Endpoint extends (ctx: any) => ZodRPCEndpoint> = {
//   children: D['children'];
//   endpoints: D['endpoints'] & { [k in Path]: Endpoint };
// };
// type addChild<D extends RouterDef, Path extends string, Child extends ZodRPCRouter> = {
//   endpoints: D['endpoints'];
//   children: D['children'] & { [k in Path]: Child };
// };

export class ZodRPCRouter<D extends RouterDef = RouterDef> {
  readonly _def!: D;

  constructor(def: D) {
    this._def = def;
  }

  static create = (): ZodRPCRouter<{ endpoints: {}; children: {} }> => {
    return new ZodRPCRouter({ endpoints: {}, children: {} });
  };

  // compose = <Path extends string, Child extends ZodRPCRouter>(
  //   path: Path,
  //   child: Child,
  // ): ZodRPCRouter<addChild<D, Path, Child>> => {
  //   this._def.children[path] = child;
  //   return this as any;
  // };
  compose = (path: string, child: ZodRPCRouter) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new ZodRPCError(500, ZodRPCErrorCode.NameConflict, `Name conflict: "${path}" already in use`);
    this._def.children[path] = child;
    return this;
  };

  // endpoint = <Path extends string, Endpoint extends (ctx: any) => ZodRPCEndpoint>(
  //   path: Path,
  //   def: Endpoint,
  // ): ZodRPCRouter<addEndpoint<D, Path, Endpoint>> => {
  //   this._def.endpoints[path] = def;
  //   return this as any;
  // };
  endpoint = (path: string, endpt: ZodRPCEndpoint) => {
    if (this._def.children[path] || this._def.endpoints[path])
      throw new ZodRPCError(500, ZodRPCErrorCode.NameConflict, `Name conflict: "${path}" already in use`);
    this._def.endpoints[path] = endpt;
    return this;
  };

  // test = (arg: { asdf: string } & ThisType<{ asdf: string }>) => {
  //   console.log(arg);
  // };

  handle: (payload: { endpoint: string[]; args: any[] }) => any = async (payload) => {
    //  const payload: { endpoint: string[]; args: any[] } = req.body;

    if (!payload) {
      throw new ZodRPCError(
        500,
        ZodRPCErrorCode.InvalidEndpoint,
        `No body received in post request.\nMake sure you've configured a body parser middleware.`,
      );
    }

    const { endpoint, args } = payload;

    if (!Array.isArray(endpoint) || !endpoint.every((x) => typeof x === 'string')) {
      throw new ZodRPCError(400, ZodRPCErrorCode.InvalidEndpoint, 'body.endpoint should be array of strings.');
    }

    if (!Array.isArray(args)) {
      throw new ZodRPCError(400, ZodRPCErrorCode.InvalidArguments, 'body.args should be an array.');
    }

    if (!endpoint || endpoint.length === 0)
      throw new ZodRPCError(400, ZodRPCErrorCode.InvalidEndpoint, 'InvalidEndpoint');

    const segment = endpoint[0];
    if (typeof segment !== 'string')
      throw new ZodRPCError(
        400,
        ZodRPCErrorCode.InvalidEndpoint,
        `Endpoint segment is of non-string type: ${typeof segment}`,
      );

    const maybeEndpoint = this._def.endpoints[segment];
    const maybeChild = this._def.children[segment];
    if (maybeEndpoint && maybeChild)
      throw new ZodRPCError(
        500,
        ZodRPCErrorCode.NameConflict,
        `Naming conflict. Endpoint and subrouter share path "${segment}"`,
      );

    if (!maybeEndpoint && !maybeChild)
      throw new ZodRPCError(501, ZodRPCErrorCode.EndpointNotFound, `Endpoint not found: "${segment}"`);

    if (maybeChild) {
      if (endpoint.length < 2) {
        throw new ZodRPCError(
          501,
          ZodRPCErrorCode.InvalidPath,
          `Endpoint path must terminate with an endpoint, not a child router`,
        );
      }
      return await maybeChild.handle({ endpoint: endpoint.slice(1), args: args });
    }

    const handler = maybeEndpoint;
    if (!(handler instanceof ZodRPCEndpoint)) {
      throw new ZodRPCError(500, ZodRPCErrorCode.InvalidEndpoint, `Invalid endpoint at "${segment}".`);
    }

    let isAuthorized;
    try {
      isAuthorized = await handler._def.authorization(args);
    } catch (err) {
      throw new ZodRPCError(500, ZodRPCErrorCode.AuthorizationError, err.message);
    }
    if (!isAuthorized) {
      throw new ZodRPCError(403, ZodRPCErrorCode.NotAuthorized, 'Access denied.');
    }

    try {
      const value = await handler._def.implementation(...args);
      return value;
    } catch (err) {
      const zerr: z.ZodError = err;
      if (zerr.errors[0].code === z.ZodErrorCode.invalid_arguments) {
        throw new ZodRPCError(500, ZodRPCErrorCode.InvalidArguments, 'Invalid arguments');
      }
      if (zerr.errors[0].code === z.ZodErrorCode.invalid_return_type) {
        throw new ZodRPCError(500, ZodRPCErrorCode.InvalidReturnType, 'Invalid arguments');
      }
      throw new ZodRPCError(500, ZodRPCErrorCode.UnknownError, err.message);
    }
    // const value = await handler._def.implementation(...args);
    // return value;
  };
}
