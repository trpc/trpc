import NextError from 'next/error';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { NextPageWithLayout } from '~/pages/_app';
import type { RouterOutput } from '~/utils/trpc';
import { trpc } from '~/utils/trpc';

type PostByIdOutput = RouterOutput['post']['byId'];

function PostItem(props: { post: PostByIdOutput }) {
  const { post } = props;
  return (
    <div className="flex h-full flex-col justify-center px-8">
      <Link className="mb-4 text-gray-300 underline" href="/">
        Home
      </Link>
      <h1 className="text-4xl font-bold">{post.title}</h1>
      <em className="text-gray-400">
        Created {post.createdAt.toLocaleDateString('en-us')}
      </em>

      <p className="break-all py-4">{post.text}</p>

      <h2 className="py-2 text-2xl font-semibold">Raw data:</h2>
      <pre className="overflow-x-scroll rounded-xl bg-gray-900 p-4">
        {JSON.stringify(post, null, 4)}
      </pre>
    </div>
  );
}

const PostViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const postQuery = trpc.post.byId.useQuery({ id });

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
      <div className="flex h-full flex-col justify-center px-8">
        <div className="mb-2 h-10 w-full animate-pulse rounded-md bg-zinc-900/70"></div>
        <div className="mb-8 h-5 w-2/6 animate-pulse rounded-md bg-zinc-900/70"></div>

        <div className="h-40 w-full animate-pulse rounded-md bg-zinc-900/70"></div>
      </div>
    );
  }
  const { data } = postQuery;
  return <PostItem post={data} />;
};

export default PostViewPage;
