/* eslint-disable react-hooks/rules-of-hooks */
import {
  Link,
  Outlet,
  createReactRouter,
  createRouteConfig,
  useMatch,
} from '@tanstack/react-router';
import { getPostById, getPosts } from '../../../server/fetchers';
import { queryClient, trpc } from './trpc';

const rootRoute = createRouteConfig({
  component: () => {
    return (
      <>
        <div className="p-2 flex gap-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/posts"
            activeProps={{
              className: 'font-bold',
            }}
          >
            Posts
          </Link>
        </div>
        <hr />
        <Outlet /> {/* Start rendering router matches */}
      </>
    );
  },
});

const indexRoute = rootRoute.createRoute({
  path: '/',
  component: () => {
    const hello = trpc.hello.useQuery();
    if (!hello.data) return <p>Loading...</p>;
    return <div>{hello.data}</div>;
  },
});

const postsRoute = rootRoute.createRoute({
  path: 'posts',
  loaderMaxAge: 0,
  errorComponent: () => 'Oh crap!',
  loader: async () => {
    const postKey = trpc.post.all.getQueryKey();

    queryClient.getQueryData(postKey) ??
      (await queryClient.prefetchQuery(postKey, getPosts));
    return {};
  },

  component: () => {
    const postsQuery = trpc.post.all.useQuery();

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {postsQuery.data?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.id}
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: 'text-black font-bold' }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    );
  },
});

const postsIndexRoute = postsRoute.createRoute({
  path: '/',

  component: () => {
    return (
      <>
        <div>Select a post.</div>
      </>
    );
  },
});

const postRoute = postsRoute.createRoute({
  path: '$postId',
  loader: async ({ params }) => {
    const postKey = trpc.post.byId.getQueryKey({ id: params.postId });

    queryClient.getQueryData(postKey) ??
      (await queryClient.prefetchQuery(postKey, () =>
        getPostById(params.postId),
      ));

    return {};
  },

  component: () => {
    const { params } = useMatch(postRoute.id);
    const postQuery = trpc.post.byId.useQuery({ id: params.postId });

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{postQuery.data?.title}</h4>
      </div>
    );
  },
});

const routeConfig = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
]);

// Set up a ReactRouter instance
export const router = createReactRouter({
  routeConfig,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface RegisterRouter {
    router: typeof router;
  }
}
