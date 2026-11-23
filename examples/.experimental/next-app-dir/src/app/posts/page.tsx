import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { ChevronRightIcon } from 'lucide-react';
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '../_components/client-ui';
import { ItemLink, LinkItem } from '../_components/link-item';
import { PageHeader } from '../_components/page-header';
import { listPosts } from './_data';
import { AddPostForm } from './AddPostForm';

export default async function Home() {
  const posts = await listPosts();

  return (
    <>
      <PageHeader
        title="Server Adapter"
        description={
          <>
            Server functions built with only <code>@trpc/server</code>, and no
            other <code>@trpc/*</code> packages. A Server Component calls the{' '}
            <code>listPosts</code> query, and the form calls the{' '}
            <code>addPost</code> mutation.
          </>
        }
      />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>All posts</CardTitle>
            <CardDescription>
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="-mx-3">
              {posts.map((post) => (
                <LinkItem key={post.id}>
                  <ItemContent>
                    <ItemTitle>
                      <ItemLink href={`/posts/${post.id}`}>
                        {post.title}
                      </ItemLink>
                    </ItemTitle>
                    <ItemDescription>{post.content}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </ItemActions>
                </LinkItem>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a post</CardTitle>
            <CardDescription>
              <code>addPost</code> rejects a title that&apos;s taken, then
              redirects to the new post.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddPostForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
