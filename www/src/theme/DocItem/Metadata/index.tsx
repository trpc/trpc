import { PageMetadata } from '@docusaurus/theme-common';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useDoc } from '@docusaurus/theme-common/internal';
import React from 'react';
import { docsParams } from '../../../../og-image/utils/zodParams';

export default function DocItemMetadata(): JSX.Element {
  const { metadata } = useDoc();
  const { title, description } = metadata;

  const ogImg = `https://og-image.trpc.io/api/docs?${docsParams.toSearchString({
    title,
    description,
    permalink: metadata.permalink,
  })}`;

  return (
    <PageMetadata title={title} description={description} image={ogImg}>
      <meta property={`og:title`} content={title} />
      <meta property={`og:image`} content={ogImg} />
      <meta data-rh="true" name="twitter:image" content={ogImg} />
      <meta property="og:description" content={description} />
    </PageMetadata>
  );
}
