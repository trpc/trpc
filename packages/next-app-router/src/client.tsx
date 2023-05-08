import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
  type CreateTRPCClientOptions,
  type TRPCUntypedClient,
} from '@trpc/client';
import { type AnyRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';
import { revalidateTag } from 'next/cache';
import $useSWR from 'swr';
import { type ClientDecoratedProcedureRecord } from './types';
import { generateCacheTag } from './utils';

export { generateCacheTag };

function createHooks(client: TRPCUntypedClient<AnyRouter>) {
  const useSWR = (path: string, input: any) => {
    const key = [path, input];
    return $useSWR(key, () => client.query(path, input));
  };

  return {
    useSWR,
  };
}

export function createTRPCNextAppRouter<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = createTRPCUntypedClient<TRouter>(opts);
  const hooks = createHooks(client);

  return createRecursiveProxy((opts) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const action = opts.path.pop()!;
    const procedureType = clientCallTypeToProcedureType(action);
    const procedurePath = opts.path.join('.');

    if (action === 'revalidate') {
      const cacheTag = generateCacheTag(procedurePath, opts.args[0]);
      revalidateTag(cacheTag);

      return;
    }

    if (action === 'useQuery') {
      const swrKey = [...opts.path] as any[];
      opts.args[0] && swrKey.push(opts.args[0]);
      return hooks.useSWR(opts.path.join('.'), opts.args[0]);
    }

    return (client as any)[procedureType](procedurePath, ...opts.args);
  }) as ClientDecoratedProcedureRecord<TRouter['_def']['record']>;
}
