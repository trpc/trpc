import { PageMetadata } from '@docusaurus/theme-common';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useDoc } from '@docusaurus/theme-common/internal';
import React from 'react';
import { searchParams } from '../../../pages';

export default function DocItemMetadata(): JSX.Element {
  const { metadata } = useDoc();
  const { title, description } = metadata;

  console.log({ metadata });

  const ogImg = `https://www-git-og-images-trpc.vercel.app/api/ogDocs?${searchParams(
    {
      title,
      description,
      // authorName: author.name as string,
      // authorTitle: author.title as string,
      // authorImg: author.imageURL as string,
      // date,
      // readingTime: (metadata.readingTime as number).toString(),
    },
  )}`;

  return (
    <PageMetadata title={title} description={description} image={ogImg}>
      <meta property={`og:title`} content={title} />
      <meta property={`og:image`} content={ogImg} />
      <meta data-rh="true" name="twitter:image" content={ogImg} />
      <meta property="og:description" content={description} />
    </PageMetadata>
  );
}
