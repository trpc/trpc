import { useDoc } from '@docusaurus/plugin-content-docs/client';
import { PageMetadata } from '@docusaurus/theme-common';
import React from 'react';
import { docsParams } from '../../../../og-image/utils/zodParams';
import { useEnv } from '../../../utils/useEnv';

export default function DocItemMetadata(): JSX.Element {
  const { metadata, frontMatter, assets } = useDoc();
  const { title, description } = metadata;

  const env = useEnv();

  const ogImg = `${env.OG_URL}/api/docs?${docsParams.toSearchString({
    title,
    description,
    permalink: metadata.permalink,
  })}`;
  return (
    <PageMetadata
      title={metadata.title}
      description={metadata.description}
      keywords={frontMatter.keywords}
      image={assets.image ?? frontMatter.image ?? ogImg}
    />
  );
}
