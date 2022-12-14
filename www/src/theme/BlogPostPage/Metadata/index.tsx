import { PageMetadata } from '@docusaurus/theme-common';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useBlogPost as ubp } from '@docusaurus/theme-common/internal';
import { useBlogPost as typedUbp } from '@docusaurus/theme-common/lib/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React from 'react';
import { searchParams } from '../../../utils/searchParams';

// /lib doesn't actually export but actual export has import error in vscode
const useBlogPost = ubp as unknown as typeof typedUbp;

export default function BlogPostPageMetadata(): JSX.Element {
  const { assets, metadata } = useBlogPost();
  const { title, description, date, tags, authors, frontMatter } = metadata;
  const { keywords } = frontMatter;
  const _image = assets.image ?? frontMatter.image;
  const {
    siteConfig: { customFields },
  } = useDocusaurusContext();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const url = customFields!['url']! as string;

  console.log({ metadata });

  const author = authors[0];

  const ogImg = `https://og-image.trpc.io/api/blog?${searchParams({
    title: metadata.title,
    description: metadata.description,
    authorName: author.name as string,
    authorTitle: author.title as string,
    authorImg: author.imageURL as string,
    date,
    readingTime: (metadata.readingTime as number).toString(),
  })}`;

  return (
    <PageMetadata
      title={title}
      description={description}
      keywords={keywords}
      image={ogImg}
    >
      <meta property="og:type" content="article" />
      <meta property={`og:title`} content={metadata.title} />
      <meta property={`og:url`} content={url + metadata.permalink} />
      <meta property={`og:image`} content={ogImg} />
      <meta data-rh="true" name="twitter:image" content={ogImg} />
      <meta property="og:description" content={metadata.description} />
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
