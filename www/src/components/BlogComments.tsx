import { useColorMode } from '@docusaurus/theme-common';
import Giscus from '@giscus/react';
import React from 'react';

export default function BlogComments(props: { discussionId: string }) {
  const { colorMode } = useColorMode();

  return (
    <Giscus
      repo="trpc/trpc"
      repoId="MDEwOlJlcG9zaXRvcnkyODA1NTcwNTQ"
      mapping="number" // Important! To map comments to URL
      term={props.discussionId}
      strict="0"
      reactionsEnabled="1"
      emitMetadata="1"
      inputPosition="top"
      theme={colorMode}
      lang="en"
      loading="lazy"
    />
  );
}
