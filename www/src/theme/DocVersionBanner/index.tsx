import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import {
  ThemeClassNames,
  useDocsPreferredVersion,
} from '@docusaurus/theme-common';
import useGlobalData from '@docusaurus/useGlobalData';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import clsx from 'clsx';
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
  const preferred = useDocsPreferredVersion();
  const preferredVersion = preferred.preferredVersion as Version;
  const location = useLocation();

  const globalData = useGlobalData();

  const versions: Version[] = (
    globalData['docusaurus-plugin-content-docs'] as any
  ).default.versions;

  // HACK
  const currentVersion: Version =
    versions
      .filter((it) => it.label !== preferredVersion?.label)
      .find((it) => location.pathname.startsWith(it.path)) ?? preferredVersion;

  const versionDict = {} as Record<VersionLabel, Version>;
  for (const version of versions) {
    versionDict[version.label] = version;
  }

  return {
    currentVersion,
    versionDict,
  };
}

export default function DocVersionBannerWrapper(
  props: React.ComponentProps<typeof DocVersionBanner>,
) {
  const location = useLocation();

  const versions = useTypedVersion();

  switch (versions.currentVersion.label) {
    case '11.x': {
      const href = location.pathname.replace('/docs', '/docs/v10');
      const v10Doc = versions.versionDict['10.x'].docs.find(
        (x) => x.path === href,
      );

      if (location.pathname.startsWith('/docs/migrate-from')) {
        // skip blob on migration page
        return null;
      }
      return (
        <div
          className={clsx(
            ThemeClassNames.docs.docVersionBanner,
            'alert alert--info margin-bottom--md space-y-2',
          )}
          role="alert"
        >
          <p>You are looking at the tRPC version 11.</p>
          <ul className="list-inside list-disc">
            <li>
              To go to v10 the documentation,{' '}
              <Link href={v10Doc ? v10Doc.path : '/docs/v10'}>click here</Link>.
            </li>
            <li>
              To see the list of changes for v11,{' '}
              <Link href="/docs/migrate-from-v10-to-v11">click here</Link>.
            </li>
          </ul>
        </div>
      );
    }

    default: {
      return <DocVersionBanner {...props} />;
    }
  }

  return (
    <>
      <div
        className={clsx(
          ThemeClassNames.docs.docVersionBanner,
          'alert alert--warning margin-bottom--md space-y-2',
        )}
        role="alert"
      >
        <p className="mb-2">
          You are looking at the tRPC version 10 <strong>beta</strong>.
        </p>
        <p>
          For documentation about version 9,{' '}
          <Link href={pathname.replace('/v10/', '/v9/')} className="font-bold">
            click here
          </Link>
        </p>
      </div>
      <DocVersionBanner {...props} />
    </>
  );
}