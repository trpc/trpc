import { trpc } from './trpc';

export function Component(props: { postIds: string[] }) {
  const [posts, postQueries] = trpc.useSuspenseQueries((t) =>
    props.postIds.map((id) => t.post.byId({ id })),
  );

  const [post, greeting] = trpc.useQueries((t) => [
    t.post.byId({ id: '1' }, { enabled: false }),
    t.greeting({ text: 'world' }),
  ]);
}
