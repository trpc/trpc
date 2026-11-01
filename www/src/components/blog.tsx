import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  MessagesSquare,
} from 'lucide-react';

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from '@shared/ui/components/avatar';
import { DocBody } from '~/components/doc-body.tsx';
import {
  CollapsedTableOfContents,
  TableOfContents,
} from '~/components/toc.tsx';
import { findPost, postNeighbours, posts } from '~/content/blog.ts';
import type { Post, PostAuthor, PostMeta } from '~/content/types.ts';
import {
  absoluteUrl,
  ogImageUrl,
  pageHead,
  postDate,
  trpcPostUrl,
} from '~/seo.ts';
import { atTrpcIo, blog, site } from '~/site.ts';

function initialsOf(name: string) {
  return name
    .split(/[\s/]+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

function AuthorAvatar(props: {
  readonly author: PostAuthor;
  readonly size: 'lg' | 'sm';
}) {
  return (
    <Avatar size={props.size}>
      {props.author.image ? (
        <AvatarImage alt="" loading="lazy" src={props.author.image} />
      ) : null}
      <AvatarFallback>{initialsOf(props.author.name)}</AvatarFallback>
    </Avatar>
  );
}

function PostDetails(props: { readonly post: PostMeta }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <time dateTime={props.post.date}>{postDate(props.post.date)}</time>
      <span aria-hidden>·</span>
      <span>{props.post.readingMinutes} min read</span>
    </p>
  );
}

export function blogHead() {
  return pageHead({
    description: blog.description,
    path: '/blog',
    structuredData: [
      {
        '@type': 'Blog',
        blogPost: posts.map((post) => ({
          '@type': 'BlogPosting',
          datePublished: post.date,
          headline: post.title,
          url: trpcPostUrl(post.slug),
        })),
        description: blog.description,
        name: `${site.name} blog`,
        url: absoluteUrl('/blog'),
      },
    ],
    title: 'Blog',
  });
}

export function BlogIndex() {
  const latest = posts[0];
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="grid gap-3">
        <p className="text-sm font-semibold text-link">Blog</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          News from the {site.name} team
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          {blog.description}
        </p>
      </header>
      {latest ? <FeaturedPost post={latest} /> : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {posts.slice(1).map((post) => (
          <li key={post.slug}>
            <PostCard post={post} />
          </li>
        ))}
      </ul>
    </main>
  );
}

function FeaturedPost(props: { readonly post: PostMeta }) {
  const post = props.post;
  return (
    <Link
      className="group relative grid gap-4 overflow-hidden rounded-xl border bg-gradient-to-br from-[oklch(0.62_0.12_245/0.12)] via-transparent to-transparent p-6 transition-colors hover:bg-accent/40 sm:p-8"
      params={{ slug: post.slug }}
      to="/blog/$slug"
    >
      <span className="w-max rounded-full border border-[oklch(0.62_0.12_245/0.4)] px-2.5 py-0.5 text-xs font-medium text-link">
        Latest
      </span>
      <PostDetails post={post} />
      <h2 className="text-2xl font-bold tracking-tight text-balance group-hover:underline sm:text-3xl">
        {post.title}
      </h2>
      <p className="line-clamp-3 max-w-3xl text-pretty text-muted-foreground">
        {post.description}
      </p>
      <Byline authors={post.authors} />
    </Link>
  );
}

function PostCard(props: { readonly post: PostMeta }) {
  const post = props.post;
  return (
    <Link
      className="group grid h-full content-start gap-3 rounded-xl border p-5 transition-colors hover:bg-accent/50"
      params={{ slug: post.slug }}
      to="/blog/$slug"
    >
      <PostDetails post={post} />
      <h2 className="text-lg font-semibold tracking-tight text-balance group-hover:underline">
        {post.title}
      </h2>
      <p className="line-clamp-3 text-sm text-pretty text-muted-foreground">
        {post.description}
      </p>
      <div className="mt-auto pt-1">
        <Byline authors={post.authors} />
      </div>
    </Link>
  );
}

/** The authors' avatars and names, without links: for a post's card, which is a link. */
function Byline(props: { readonly authors: ReadonlyArray<PostAuthor> }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <AvatarGroup>
        {props.authors.map((author) => (
          <AuthorAvatar author={author} key={author.name} size="sm" />
        ))}
      </AvatarGroup>
      <span className="font-medium">
        {props.authors.map((author) => author.name).join(', ')}
      </span>
    </div>
  );
}

/** A post's `head()`: trpc.io is where it's published, so its canonical URL is there. */
export function postHead(slug: string) {
  const post = findPost(slug);
  if (!post) {
    return { meta: [{ title: `Not found | ${site.name}` }] };
  }
  const path = `/blog/${post.slug}`;
  return pageHead({
    article: {
      authors: post.authors.flatMap((author) =>
        author.url === undefined ? [] : [author.url],
      ),
      published: post.date,
    },
    canonical: trpcPostUrl(post.slug),
    description: post.description,
    path,
    structuredData: [
      {
        '@type': 'BlogPosting',
        author: post.authors.map((author) => ({
          '@type': 'Person',
          image: author.image,
          name: author.name,
          url: author.url,
        })),
        datePublished: post.date,
        description: post.description,
        headline: post.title,
        image: ogImageUrl(path),
        inLanguage: 'en',
        mainEntityOfPage: trpcPostUrl(post.slug),
        publisher: { '@type': 'Organization', name: site.name, url: site.url },
        url: trpcPostUrl(post.slug),
      },
    ],
    title: post.title,
    type: 'article',
  });
}

const footerLink =
  'inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground';

export function BlogPost(props: { readonly post: Post }) {
  const post = props.post;
  const around = postNeighbours(post.slug);
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <article className="mx-auto w-full max-w-3xl min-w-0">
        <header className="mb-8 grid gap-4 border-b pb-6">
          <Link
            className="flex w-max items-center gap-1.5 text-sm font-semibold text-link hover:underline"
            to="/blog"
          >
            <ArrowLeft className="size-3.5" /> Blog
          </Link>
          <PostDetails post={post} />
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {post.title}
          </h1>
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {post.authors.map((author) => (
              <li className="flex items-center gap-3" key={author.name}>
                <AuthorAvatar author={author} size="lg" />
                <div className="grid text-sm">
                  {author.url ? (
                    <a
                      className="font-medium hover:underline"
                      href={author.url}
                    >
                      {author.name}
                    </a>
                  ) : (
                    <span className="font-medium">{author.name}</span>
                  )}
                  {author.title ? (
                    <span className="text-muted-foreground">
                      {author.title}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </header>
        <CollapsedTableOfContents
          className="mb-8 xl:hidden"
          headings={post.headings}
          key={post.slug}
        />
        <DocBody html={post.html} />
        <footer className="mt-12 grid gap-6 border-t pt-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {atTrpcIo ? null : (
              <a className={footerLink} href={trpcPostUrl(post.slug)}>
                <ExternalLink className="size-3.5" /> Read this post on trpc.io
              </a>
            )}
            {post.discussion === undefined ? null : (
              <a
                className={footerLink}
                href={`${site.github}/discussions/${post.discussion}`}
              >
                <MessagesSquare className="size-3.5" /> Discuss it on GitHub
              </a>
            )}
          </div>
          <nav aria-label="More posts" className="grid gap-3 sm:grid-cols-2">
            {around.newer ? (
              <Link
                className="group grid gap-1 rounded-lg border p-4 hover:bg-accent/50"
                params={{ slug: around.newer.slug }}
                to="/blog/$slug"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3" /> Newer
                </span>
                <span className="font-medium">{around.newer.title}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {around.older ? (
              <Link
                className="group grid gap-1 rounded-lg border p-4 text-right hover:bg-accent/50"
                params={{ slug: around.older.slug }}
                to="/blog/$slug"
              >
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  Older <ArrowRight className="size-3" />
                </span>
                <span className="font-medium">{around.older.title}</span>
              </Link>
            ) : null}
          </nav>
        </footer>
      </article>
      <aside className="hidden xl:block">
        <div className="sticky top-22">
          <TableOfContents headings={post.headings} key={post.slug} />
        </div>
      </aside>
    </div>
  );
}
