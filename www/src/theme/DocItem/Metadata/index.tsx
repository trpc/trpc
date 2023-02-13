import { PageMetadata } from '@docusaurus/theme-common';
import { useDoc } from '@docusaurus/theme-common/internal';
import React from 'react';
import { docsParams } from '../../../../og-image/utils/zodParams';
import { useEnv } from '../../../utils/useEnv';

export default function DocItemMetadata(): JSX.Element {
  const { metadata } = useDoc();
  const { title, description } = metadata;

  const env = useEnv();

  const ogImg = `${env.OG_URL}/api/docs?${docsParams.toSearchString({
    title,
    description,
    permalink: metadata.permalink,
  })}`;

  return <PageMetadata title={title} description={description} image={ogImg} />;
}
