import { useBlogPost } from '@docusaurus/plugin-content-blog/client';
import { useColorMode } from '@docusaurus/theme-common';
import Giscus from '@giscus/react';
import BlogPostItem from '@theme-original/BlogPostItem';
import React from 'react';

export default function BlogPostItemWrapper(props: any): React.JSX.Element {
  const { metadata, isBlogPostPage } = useBlogPost();
  const { colorMode } = useColorMode();

  const { frontMatter } = metadata;
  const { commentDiscussionId } = frontMatter;

  return (
    <>
      <BlogPostItem {...props} />
      {commentDiscussionId && isBlogPostPage && (
        <Giscus
          repo="trpc/trpc"
          repoId="MDEwOlJlcG9zaXRvcnkyODA1NTcwNTQ"
          mapping="number"
          term={commentDiscussionId as string}
          strict="0"
          reactionsEnabled="1"
          emitMetadata="1"
          inputPosition="top"
          theme={colorMode}
          lang="en"
        />
      )}
    </>
  );
}
