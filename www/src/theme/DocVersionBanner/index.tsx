import type Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useGlobalData from '@docusaurus/useGlobalData';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import React from 'react';

type VersionLabel = '11.x' | '9.x' | '10.x';

interface Version {
  name: string;
  label: VersionLabel;
  isLast: boolean;
  path: string;
  mainDocId: string;
  docs: Doc[];
  draftIds: any[];
  sidebars: Sidebars;
}

interface Doc {
  id: string;
  path: string;
  sidebar?: string;
}

interface Sidebars {
  docs: Docs;
}

interface Docs {
  link: Link;
}

interface Link {
  path: string;
  label: string;
}

function useTypedVersion() {
  const location = useLocation();

  const globalData = useGlobalData();

  const versions: Version[] = (
    globalData['docusaurus-plugin-content-docs'] as any
  ).default.versions;

  const byLabel = {} as Record<VersionLabel, Version>;
  for (const version of versions) {
    byLabel[version.label] = version;
  }

  const currentVersion: Version =
    versions
      .filter((it) => it.path !== '/docs')
      .find((it) => location.pathname.startsWith(it.path)) ??
    versions.find((it) => it.isLast) ??
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    versions[0]!;

  return {
    currentVersion,
    byLabel,
  };
}

export default function DocVersionBannerWrapper(
  props: React.ComponentProps<typeof DocVersionBanner>,
) {
  const versions = useTypedVersion();

  switch (versions.currentVersion.label) {
    case '11.x': {
      return null;
    }
    case '10.x':
    case '9.x':
    default: {
      return <DocVersionBanner {...props} />;
    }
  }
}
