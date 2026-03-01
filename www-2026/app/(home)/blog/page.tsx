import { blog } from '@/lib/source';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'tRPC blog posts and announcements',
};

interface BlogPostData {
  title?: string;
  description?: string;
  date?: string | Date;
}

export default function BlogIndex() {
  const posts = blog
    .getPages()
    .sort((a, b) => {
      const aData = a.data as unknown as BlogPostData;
      const bData = b.data as unknown as BlogPostData;
      return (
        new Date(bData.date ?? 0).getTime() -
        new Date(aData.date ?? 0).getTime()
      );
    });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-bold">Blog</h1>
      <div className="flex flex-col gap-6">
        {posts.map((post) => {
          const data = post.data as unknown as BlogPostData;
          return (
            <Link
              key={post.url}
              href={post.url}
              className="group rounded-lg border border-fd-border p-6 transition-colors hover:bg-fd-accent"
            >
              <h2 className="mb-2 text-xl font-semibold group-hover:text-fd-primary">
                {data.title}
              </h2>
              {data.description && (
                <p className="mb-2 text-fd-muted-foreground">
                  {data.description}
                </p>
              )}
              {data.date && (
                <p className="text-sm text-fd-muted-foreground">
                  {new Date(data.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
