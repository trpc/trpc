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
  dataOf,
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
export function authorCardEntries(
  trpc: TRPC,
  opts: { authorId: string; exceptSlug: string },
) {
  // `staleTime: 0` so every visit shows its requests in the log
  const author = prefetchEntry(
    trpc.blog.authorById,
    { id: opts.authorId },
    { staleTime: 0 },
  );
  return {
    author,
    // A second step: the post list is filtered by the id of the author, who
    // is loaded with an id from the post. With pipelining, post, author and
    // list are one request. Without, they are three, one after the other
    moreByAuthor: prefetchEntry(
      trpc.blog.posts,
      { authorId: dataOf(author).id, exceptSlug: opts.exceptSlug },
      { staleTime: 0 },
    ),
  };
}

export function AuthorCard(
  props: Readonly<{ handles: inferHandles<typeof authorCardEntries> }>,
) {
  const trpc = useTRPC();
  const authorQuery = useSuspenseQuery(fromHandle(trpc, props.handles.author));
  const moreQuery = useSuspenseQuery(
    fromHandle(trpc, props.handles.moreByAuthor),
  );
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
        <p className="mb-2 text-sm font-medium">More by {author.name}</p>
        {moreQuery.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing else yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {moreQuery.data.map((post) => (
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
        )}
      </CardContent>
    </Card>
  );
}
