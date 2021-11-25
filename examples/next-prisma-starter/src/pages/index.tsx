import { TRPCClientError, TRPCClientErrorLike } from '@trpc/client';
import { Maybe } from '@trpc/server';
import Link from 'next/link';
import { dehydrate, DehydratedState, QueryClient } from 'react-query';
import { trpc } from '../utils/trpc';
import { getBaseUrl, NextPageWithLayout } from './_app';
import superjson from 'superjson';
import ssrPrepass from 'react-ssr-prepass';
import { createElement } from 'react';
const IndexPage: NextPageWithLayout = (props) => {
  console.log({ props });
  const utils = trpc.useContext();

  const postsQuery = trpc.useQuery(['post.all']);
  const addPost = trpc.useMutation('post.add', {
    async onSuccess() {
      // refetches posts after a post is added
      await utils.invalidateQueries(['post.all']);
    },
  });

  // prefetch all posts for instant navigation
  // useEffect(() => {
  //   for (const { id } of postsQuery.data ?? []) {
  //     utils.prefetchQuery(['post.byId', { id }]);
  //   }
  // }, [postsQuery.data, utils]);

  return (
    <>
      <h1>Welcome to your tRPC starter!</h1>
      <p>
        Check <a href="https://trpc.io/docs">the docs</a> whenever you get
        stuck, or ping <a href="https://twitter.com/alexdotjs">@alexdotjs</a> on
        Twitter.
      </p>

      <h2>
        Posts
        {postsQuery.status === 'loading' && '(loading)'}
      </h2>
      {postsQuery.data?.map((item) => (
        <article key={item.id}>
          <h3>{item.title}</h3>
          <Link href={`/post/${item.id}`}>
            <a>View more</a>
          </Link>
        </article>
      ))}

      <hr />

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          /**
           * In a real app you probably don't want to use this manually
           * Checkout React Hook Form - it works great with tRPC
           * @link https://react-hook-form.com/
           */

          const $text: HTMLInputElement = (e as any).target.elements.text;
          const $title: HTMLInputElement = (e as any).target.elements.title;
          const input = {
            title: $title.value,
            text: $text.value,
          };
          try {
            await addPost.mutateAsync(input);

            $title.value = '';
            $text.value = '';
          } catch {}
        }}
      >
        <label htmlFor="title">Title:</label>
        <br />
        <input
          id="title"
          name="title"
          type="text"
          disabled={addPost.isLoading}
        />

        <br />
        <label htmlFor="text">Text:</label>
        <br />
        <textarea id="text" name="text" disabled={addPost.isLoading} />
        <br />
        <input type="submit" disabled={addPost.isLoading} />
        {addPost.error && (
          <p style={{ color: 'red' }}>{addPost.error.message}</p>
        )}
      </form>
    </>
  );
};

function transformQueryOrMutationCacheErrors<
  TState extends
    | DehydratedState['queries'][0]
    | DehydratedState['mutations'][0],
>(result: TState): TState {
  const error = result.state.error as Maybe<TRPCClientError<any>>;
  if (error instanceof Error && error.name === 'TRPCClientError') {
    const newError: TRPCClientErrorLike<any> = {
      message: error.message,
      data: error.data,
      shape: error.shape,
    };
    return {
      ...result,
      state: {
        ...result.state,
        error: newError,
      },
    };
  }
  return result;
}
IndexPage.getInitialProps = async (context) => {
  const queryClient = new QueryClient();
  const client = trpc.createClient({
    transformer: superjson,
    url: getBaseUrl() + '/api/trpc',
  });

  const trpcProp = {
    config: {},
    trpcClient: client,
    queryClient,
    isPrepass: true,
    ssrContext: context,
  };
  const prepassProps = {
    pageProps: {},
    trpc: trpcProp,
  };
  // Run the prepass step on AppTree. This will run all trpc queries on the server.
  // multiple prepass ensures that we can do batching on the server
  while (true) {
    // render full tree
    await ssrPrepass(createElement(context.AppTree, prepassProps as any));
    if (!queryClient.isFetching()) {
      // the render didn't cause the queryClient to fetch anything
      break;
    }

    // wait until the query cache has settled it's promises
    await new Promise<void>((resolve) => {
      const unsub = queryClient.getQueryCache().subscribe((event) => {
        if (event?.query.getObserversCount() === 0) {
          resolve();
          unsub();
        }
      });
    });
  }

  const dehydratedCache = dehydrate(queryClient, {
    shouldDehydrateQuery() {
      // makes sure errors are also dehydrated
      return true;
    },
  });
  // since error instances can't be serialized, let's make them into `TRPCClientErrorLike`-objects
  const dehydratedCacheWithErrors = {
    ...dehydratedCache,
    queries: dehydratedCache.queries.map(transformQueryOrMutationCacheErrors),
    mutations: dehydratedCache.mutations.map(
      transformQueryOrMutationCacheErrors,
    ),
  };

  const trpcState = client.runtime.transformer.serialize(
    dehydratedCacheWithErrors,
  );

  return {
    trpcState,
  };
};

export default IndexPage;

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @link https://trpc.io/docs/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createSSGHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.fetchQuery('post.all');
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
