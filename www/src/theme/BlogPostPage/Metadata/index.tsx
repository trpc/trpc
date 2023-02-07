import { PageMetadata } from '@docusaurus/theme-common';
import { useBlogPost as ubp } from '@docusaurus/theme-common/internal';
import { useBlogPost as typedUbp } from '@docusaurus/theme-common/internal';
import React from 'react';
import { blogParams } from '../../../../og-image/utils/zodParams';
import { useEnv } from '../../../utils/useEnv';

// /lib doesn't actually export but actual export has import error in vscode
const useBlogPost = ubp as unknown as typeof typedUbp;

export default function BlogPostPageMetadata(): JSX.Element {
  const { metadata } = useBlogPost();
  const { title, description, date, tags, authors, frontMatter } = metadata;
  const { keywords } = frontMatter;
  const author = authors[0];
  const env = useEnv();

  const ogImg = `${env.OG_URL}/api/blog?${blogParams.toSearchString({
    title: metadata.title,
    description: metadata.description,
    authorName: author.name as string,
    authorTitle: author.title as string,
    authorImg: author.imageURL as string,
    date,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    readingTimeInMinutes: metadata.readingTime!,
  })}`;

  return (
    <PageMetadata
      title={title}
      description={description}
      keywords={keywords}
      image={ogImg}
    >
      <meta property="og:type" content="article" />
      <meta property="article:published_time" content={date} />
      {authors.some((author) => author.url) && (
        <meta
          property="article:author"
          content={authors
            .map((author) => author.url)
            .filter(Boolean)
            .join(',')}
        />
      )}
      {tags.length > 0 && (
        <meta
          property="article:tag"
          content={tags.map((tag) => tag.label).join(',')}
        />
      )}
    </PageMetadata>
  );
}
