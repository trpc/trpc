import { db } from '@/db/client';
import { Post } from '@/db/schema';
import { publicAction } from '@/server/trpc';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

const postById = cache(
  publicAction.input(z.string()).query(async (opts) => {
    const post = await db.query.Post.findFirst({
      where: eq(Post.id, opts.input),
    });

    if (!post) notFound();
    return post;
  }),
);

export default async function Page(props: {
  params: {
    postId: string;
  };
}) {
  const post = await postById(props.params.postId);

  return (
    <div className="p-16">
      <Link href="/" className="rounded bg-zinc-800 p-1">{`< Home`}</Link>
      <h1>{post.title}</h1>

      <p>{post.content}</p>
    </div>
  );
}
