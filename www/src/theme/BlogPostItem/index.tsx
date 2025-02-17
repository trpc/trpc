import { useBlogPost } from '@docusaurus/plugin-content-blog/client';
import BlogPostItem from '@theme-original/BlogPostItem';
import React from 'react';
import BlogComments from '../../components/BlogComments';

export default function BlogPostItemWrapper(props: any) {
  const { metadata, isBlogPostPage } = useBlogPost();

  const { frontMatter } = metadata;
  const { commentDiscussionId } = frontMatter;

  return (
    <>
      <BlogPostItem {...props} />
      {commentDiscussionId && isBlogPostPage && (
        <BlogComments discussionId={String(commentDiscussionId)} />
      )}
    </>
  );
}
