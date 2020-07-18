import { ZodRPCApi, ZodRPCRouter } from '../internal';
import * as z from 'zod';

const capitalize = (arg: string) => arg.charAt(0).toUpperCase() + arg.slice(1);
type GenParams = {
  path: string[];
  generator: z.ZodCodeGenerator;
  routers: { name: string; definition: string; router: ZodRPCRouter }[];
};

export const generateSDK = (api: ZodRPCApi) => {
  const generator = z.codegen();
  const initialParams: GenParams = { path: [], routers: [], generator };
  const rootDef = generateSDKObjectFromRouter(api._def.router, initialParams);

  //${initialParams.routers.map((router) => `class ${router.name} ${router.definition}`).join('\n\n')}
  return `
${generator.dump()}

type Handler =  (url: string, payload:{endpoint: string[], args: unknown[]}) => Promise<unknown>;
export class SkiiClient {
  private _url = "${api._def.uri}";
  private _handler: Handler;
  private readonly _defaultHandler: Handler = async (url, payload)=>{
    // console.log("fetching: "+url);
    // console.log(JSON.stringify(payload, null, 2));
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    })

    const result = await response.json();
    // console.log("fetched "+JSON.stringify(result, null, 2));
    return result;
  }
  private _router = ${rootDef.definition};

  constructor(handler?:Handler){
    if(handler){
      this._handler = handler;
    }else{
      this._handler = this._defaultHandler;
    }
  }

  ${[...Object.keys(api._def.router._def.endpoints), ...Object.keys(api._def.router._def.children)]
    .map((k) => {
      return `${k} = this._router.${k};`;
    })
    .join('  \n')}
}
`;
};

const generateSDKObjectFromRouter = (router: ZodRPCRouter, params: GenParams): { name: string; definition: string } => {
  const { endpoints, children } = router._def;
  const subrouterLines: string[] = [];
  const endpointLines: string[] = [];

  for (const key in children) {
    const child = children[key];
    const result = generateSDKObjectFromRouter(child, {
      ...params,
      path: [...params.path, key],
    });
    subrouterLines.push(`${key}: ${result.definition}`);
  }

  for (const key in endpoints) {
    const endpoint = endpoints[key];
    const func = endpoint._def.function;

    const argsType = params.generator.generate(func._def.args);
    const returnsType = params.generator.generate(func._def.returns);
    endpointLines.push(
      `${key}: (...args:${argsType.id}) => this._handler(this._url, {endpoint:${JSON.stringify([
        ...params.path,
        key,
      ])}, args}) as ${returnsType.id}`,
    );
  }

  const spacing = Array(params.path.length + 2).join('  ');
  const name = `${params.path.map(capitalize).join('')}`;
  const definition = ['{', ...subrouterLines.map((x) => `  ${x}`), ...endpointLines.map((x) => `  ${x},`), '}'].join(
    `\n${spacing}`,
  );
  const routerDef = { name: name || 'Root', definition, router };
  params.routers.push(routerDef);
  return routerDef;
};
