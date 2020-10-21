import Axios from 'axios';
import { TRPCRouter, TRPCEndpoint } from './internal';
import { tsutil } from './tsutil';
import { TRPCPayload } from './router';

export type ClientSDKHandler = (
  url: string,
  payload: { path: string[]; args: unknown[]; context: unknown },
) => Promise<unknown>;

export type ToClientSDKParams<Ctx> = {
  url: string;
  getContext: () => Ctx;
  handler?: ClientSDKHandler;
};

const defaultHandler = async (url: string, data: any) => {
  const result = await Axios.post(url, data);
  return result.data;
};

type EndpointToSDK<T extends TRPCEndpoint<any>, Ctx> = T['_func'] extends (
  ctx: any,
) => (...args: infer U) => any
  ? (
      ...args: U
    ) => {
      run: () => tsutil.promisify<ReturnType<ReturnType<T['_func']>>>;
      payload: TRPCPayload<Ctx>;
    }
  : never;
type RouterToSDK<T extends TRPCRouter<any, any>, Ctx> = tsutil.format<
  {
    [k in keyof T['_def']['children']]: T['_def']['children'][k] extends TRPCRouter<
      any
    >
      ? RouterToSDK<T['_def']['children'][k], Ctx>
      : never;
  } &
    {
      [k in keyof T['_def']['endpoints']]: EndpointToSDK<
        T['_def']['endpoints'][k],
        Ctx
      >;
    }
>;

export const makeSDK: <T extends TRPCRouter<any, any>, Ctx = unknown>(
  params: ToClientSDKParams<Ctx>,
) => RouterToSDK<T, Ctx> = (params) => {
  const handler: ClientSDKHandler = params.handler || defaultHandler;

  function makeSubSDK(path: string[]): any {
    const handle = function (...args: any[]) {
      const context = params.getContext();
      const payload = {
        path,
        args,
        context,
      };
      return {
        run: () => handler(params.url, payload),
        payload,
      };
    };

    return new Proxy(function () {}, {
      get(obj, name: string) {
        if (name === 'apply') {
          return (...args: any) => handle(...args[1]);
        }
        if (name === 'call') {
          return (...args: any) => handle(...args.slice(1));
        }
        if (typeof name === 'string' && name !== 'constructor') {
          return makeSubSDK([...path, name]);
        }

        return obj;
      },
      apply: function (_target, _this, argumentsList) {
        return handle(...argumentsList);
      },
    });
  }
  return makeSubSDK([]);
};
