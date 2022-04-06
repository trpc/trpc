import { trpc } from './trpc';
import { IncomingMessage } from 'http';
import { useMutation } from 'react-query';
import { AppRouter } from '~/server/routers/_app';

async function getPostBody(req: IncomingMessage) {
  return new Promise<{ data: unknown }>((resolve) => {
    let body = '';
    let hasBody = false;
    req.on('data', function (data: unknown) {
      body += data;
      hasBody = true;
    });
    req.on('end', () => {
      resolve({
        data: hasBody ? body : undefined,
      });
    });
  });
}

export function useSSRForm<
  TPath extends keyof AppRouter['_def']['mutations'] & string,
>(path: TPath) {
  const utils = trpc.useContext();
  const mutation = trpc.useMutation(path, {
    async onSuccess() {
      // invalidate all queries on mutation
      await utils.queryClient.invalidateQueries();
    },
  });
  const req = utils.ssrContext?.req;
  const onSubmit: JSX.IntrinsicElements['form']['onSubmit'] = (e) => {
    const formData = new FormData(e.currentTarget);
    const object: any = {};
    formData.forEach(function (value, key) {
      object[key] = value;
    });
    mutation.mutate(object);
    e.preventDefault();
  };

  const ssrMutation = useMutation(path + '__mutation', async () => {
    if (!req) {
      throw new Error('No req');
    }
    const res = await getPostBody(req);
    if (typeof res.data !== 'string') {
      throw new Error('Expected string');
    }
    const data = JSON.parse(
      '{"' +
        decodeURI(res.data as any)
          .replace(/"/g, '\\"')
          .replace(/&/g, '","')
          .replace(/=/g, '":"') +
        '"}',
    );
    mutation.mutate(data);
  });
  const result = {
    onSubmit,
    mutation,
  };

  if (req && req.method === 'POST') {
    // we've received a POST
    const set: Set<string> = ((req as any).__trpc =
      (req as any).__trpc ?? new Set<string>());

    // make sure post is only executed once
    if (set.has(path)) {
      return result;
    }
    set.add(path);
    ssrMutation.mutate();
  }
  return result;
}
