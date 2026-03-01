import { blog } from '@/lib/source';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { DocsBody } from 'fumadocs-ui/page';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import type { Metadata } from 'next';
import type { FC } from 'react';
import type { MDXProps } from 'mdx/types';
import type { TableOfContents } from 'fumadocs-core/server';

interface BlogPageData {
  title?: string;
  description?: string;
  author?: string;
  date?: string | Date;
  body: FC<MDXProps>;
  toc: TableOfContents;
}

export default async function BlogPost(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const page = blog.getPage([params.slug]);
  if (!page) notFound();

  const data = page.data as unknown as BlogPageData;
  const MDX = data.body;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <article>
        <div className="mb-8">
          <h1 className="mb-4 text-4xl font-bold">{data.title}</h1>
          <div className="flex items-center gap-4 text-fd-muted-foreground">
            {data.author && <span>By {data.author}</span>}
            {data.date && (
              <time>
                {new Date(data.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            )}
          </div>
        </div>
        <InlineTOC items={data.toc} />
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </article>
    </main>
  );
}

export function generateStaticParams() {
  return blog.getPages().map((page) => ({
    slug: page.slugs[0] ?? '',
  }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = blog.getPage([params.slug]);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
