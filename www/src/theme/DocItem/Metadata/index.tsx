import { PageMetadata } from '@docusaurus/theme-common';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useDoc } from '@docusaurus/theme-common/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React from 'react';
import { searchParams } from '../../../utils/searchParams';

export default function DocItemMetadata(): JSX.Element {
  const {
    siteConfig: { customFields },
  } = useDocusaurusContext();
  const { metadata } = useDoc();
  const { title, description } = metadata;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const url = customFields!['url']! as string;

  console.log({ metadata });

  const ogImg = `https://og-image.trpc.io/api/docs?${searchParams({
    title,
    description,
    url: url + metadata.permalink,
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
