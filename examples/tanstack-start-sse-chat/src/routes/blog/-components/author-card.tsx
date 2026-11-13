import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  fromHandle,
  prefetchEntry,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { inferHandles } from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/lib/trpc';

/**
 * The queries this card needs. It takes an author's id as a string and
 * doesn't care where it comes from: the post page passes one that the server
 * fills in.
 */
export function authorCardEntries(trpc: TRPC, opts: { authorId: string }) {
  return {
    // `staleTime: 0` so every visit shows its requests in the log
    author: prefetchEntry(
      trpc.blog.authorById,
      { id: opts.authorId },
      { staleTime: 0 },
    ),
    posts: prefetchEntry(
      trpc.blog.postsByAuthor,
      { authorId: opts.authorId },
      { staleTime: 0 },
    ),
  };
}

export function AuthorCard(
  props: Readonly<{ handles: inferHandles<typeof authorCardEntries> }>,
) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.handles.author));
  const postsQuery = useSuspenseQuery(fromHandle(trpc, props.handles.posts));
  const author = authorQuery.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{author.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <CardTitle>{author.name}</CardTitle>
            <CardDescription>{author.bio}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-medium">By {author.name}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {postsQuery.data.map((post) => (
            <li key={post.slug}>
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                preload={false}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
