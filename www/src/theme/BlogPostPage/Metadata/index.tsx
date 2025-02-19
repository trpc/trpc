import { useBlogPost } from '@docusaurus/plugin-content-blog/client';
import { PageMetadata } from '@docusaurus/theme-common';
import React from 'react';
import { blogParams } from '../../../../og-image/utils/zodParams';
import { useEnv } from '../../../utils/useEnv';

export default function BlogPostPageMetadata(): React.JSX.Element {
  const { assets, metadata } = useBlogPost();
  const { title, description, date, tags, authors, frontMatter } = metadata;

  const { keywords } = frontMatter;

  const env = useEnv();

  const ogImg = `${env.OG_URL}/api/blog?${blogParams.toSearchString({
    title: metadata.title,
    description: metadata.description,
    authors: authors.map((author) => ({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      name: author.name!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      title: author.title!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      img: author.imageURL!,
    })),
    date,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    readingTimeInMinutes: metadata.readingTime!,
  })}`;

  const image = assets.image ?? frontMatter.image ?? ogImg;

  return (
    <PageMetadata
      title={title}
      description={description}
      keywords={keywords}
      image={image}
    >
      <meta property="og:type" content="article" />
      <meta property="article:published_time" content={date} />
      {/* TODO double check those article meta array syntaxes, see https://ogp.me/#array */}
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
