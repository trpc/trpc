import Axios from 'axios';
import { TRPCRouter } from '../internal';

export type ClientSDKHandler = (
  url: string,
  payload: { path: string[]; args: unknown[]; context: any },
) => Promise<unknown>;
export type ToClientSDKParams = {
  url: string;
  getContext: () => Promise<any>;
  handler?: ClientSDKHandler;
};

const defaultHandler = async (url: string, data: any) => {
  const result = await Axios.post(url, data);
  return result.data;
};

export const makeSDK = <T extends TRPCRouter<any>>(
  params: ToClientSDKParams,
): T['_sdk'] => {
  const handler: ClientSDKHandler = params.handler || defaultHandler;
  function makeSubSDK(path: string[]): any {
    return new Proxy(function () {}, {
      get(obj, name: string) {
        if (typeof name === 'string' && name !== 'constructor') {
          return makeSubSDK([...path, name]);
        }
        return obj;
      },
      apply: async function (_target, _this, argumentsList) {
        const context = await params.getContext();
        return handler(params.url, {
          path,
          args: argumentsList,
          context,
        });
      },
    });
  }
  return makeSubSDK([]);
};
