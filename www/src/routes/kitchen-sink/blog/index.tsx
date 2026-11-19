import { createFileRoute } from '@tanstack/react-router';
import { MousePointerClickIcon } from 'lucide-react';

import { SeeItYourself } from './-components/note.tsx';

/**
 * The blog's index. The post list is the blog's own (`route.tsx`), so it
 * stays beside a post on a wide screen: here is what to try, and on a wide
 * screen, where a post opens.
 */
export const Route = createFileRoute('/kitchen-sink/blog/')({
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <>
      <SeeItYourself>
        <p>
          Open your browser’s Network tab and open a post you haven’t opened
          yet. The post, its author and the posts of the author’s team each need
          the one before. They still load in one request:{' '}
          <code>blog.postBySlug,blog.authorById,blog.posts</code>. The meter
          above counts it.
        </p>
        <p>
          Scroll down the list: the next page of posts and an author for every
          post on it are one request too.
        </p>
        <p>
          Turn on “Slow” to watch each part arrive after the one before it,
          still in that one request. With links preloading, a link may have
          loaded its post before you click.
        </p>
      </SeeItYourself>
      <div className="hidden min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground lg:flex">
        <MousePointerClickIcon aria-hidden className="size-5" />
        Pick a post from the list. It opens here, in one request.
      </div>
    </>
  );
}
