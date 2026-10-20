import {
  createReactClient,
  useQuery,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { localLink, routerType } from '@trpc12/trpc/client';
import { expectTypeOf, test } from 'vite-plus/test';
import { router, type AppRouter } from '../../trpc/src/fixtures/posts.ts';

const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [localLink({ router })],
});
const post = trpc.post.byId.query({ id: '1' });
type PostError = NonNullable<(typeof post)['~error']>;

test('useQuery keeps the data and error types; select picks the data type', () => {
  expectTypeOf(useQuery(post)).toEqualTypeOf<typeof post>();
  const title = useQuery(post, { select: (data) => data.title });
  expectTypeOf(title).toEqualTypeOf<QueryPromise<string, PostError>>();
  expectTypeOf(useQuery(post, {})).toEqualTypeOf<typeof post>();
  // @ts-expect-error: select takes the query's data
  void useQuery(post, { select: (data: { nope: string }) => data.nope });
});
