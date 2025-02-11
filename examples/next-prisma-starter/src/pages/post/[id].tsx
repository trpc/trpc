import NextError from 'next/error';
import Link from 'next/link';
import { useRouter } from 'next/router';

import type { NextPageWithLayout } from '~/pages/_app';
import type { RouterOutput } from '~/utils/trpc';
import { useTRPC } from '~/utils/trpc';

import { useQuery } from '@tanstack/react-query';

type PostByIdOutput = RouterOutput['post']['byId'];

function PostItem(props: { post: PostByIdOutput }) {
  const { post } = props;
  return (
    <div className="flex flex-col justify-center h-full px-8 ">
      <Link className="text-gray-300 underline mb-4" href="/">
        Home
      </Link>
      <h1 className="text-4xl font-bold">{post.title}</h1>
      <em className="text-gray-400">
        Created {post.createdAt.toLocaleDateString('en-us')}
      </em>

      <p className="py-4 break-all">{post.text}</p>

      <h2 className="text-2xl font-semibold py-2">Raw data:</h2>
      <pre className="bg-gray-900 p-4 rounded-xl overflow-x-scroll">
        {JSON.stringify(post, null, 4)}
      </pre>
    </div>
  );
}

const PostViewPage: NextPageWithLayout = () => {
  const trpc = useTRPC();
  const id = useRouter().query.id as string;
  const opts = trpc.post.byId.queryOptions({ id });
  /*
  const opts: UnusedSkipTokenTRPCQueryOptionsOut<{
    id: string;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}, {
    id: string;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}, TRPCClientErrorLike<{
    transformer: true;
    errorShape: DefaultErrorShape;
}>>
    */
  const postQuery = useQuery(opts);
  /**
   (alias) useQuery<{
    id: string;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}, TRPCClientErrorLike<{
    transformer: true;
    errorShape: DefaultErrorShape;
}>, {
    id: string;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}, TRPCQueryKey>(options: UndefinedInitialDataOptions<...>, queryClient?: QueryClient): UseQueryResult<...> (+2 overloads)
import useQuery

const postQuery: UseQueryResult<{
    id: string;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}, TRPCClientErrorLike<{
    transformer: true;
    errorShape: DefaultErrorShape;
}>>
   */

  if (postQuery.error) {
    return (
      <NextError
        title={postQuery.error.message}
        statusCode={postQuery.error.data?.httpStatus ?? 500}
      />
    );
  }

  if (postQuery.status !== 'success') {
    return (
      <div className="flex flex-col justify-center h-full px-8 ">
        <div className="w-full bg-zinc-900/70 rounded-md h-10 animate-pulse mb-2"></div>
        <div className="w-2/6 bg-zinc-900/70 rounded-md h-5 animate-pulse mb-8"></div>

        <div className="w-full bg-zinc-900/70 rounded-md h-40 animate-pulse"></div>
      </div>
    );
  }
  const { data } = postQuery;
  return <PostItem post={data} />;
};

export default PostViewPage;
