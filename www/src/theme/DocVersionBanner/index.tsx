import Link from '@docusaurus/Link';
import {
  useActivePlugin,
  useDocsData,
} from '@docusaurus/plugin-content-docs/client';
import { useLocation } from '@docusaurus/router';
import {
  ThemeClassNames,
  useDocsPreferredVersion,
} from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useGlobalData from '@docusaurus/useGlobalData';
import useRouteContext from '@docusaurus/useRouteContext';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import clsx from 'clsx';
import React, { useCallback } from 'react';

type VersionLabel = '11.x' | '9.x' | '10.x';
interface DocsData {
  path: string;
  versions: Version[];
  breadcrumbs: boolean;
}

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
      .filter((x) => x.label !== preferredVersion?.label)
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
  const { pluginId } = useActivePlugin({ failfast: true });

  const data: DocsData = useDocsData(pluginId);
  const { pathname } = useLocation();

  const versions = useTypedVersion();
  console.log({
    useRouteContext: useRouteContext(),
    data,
    useDocusaurusContext: useDocusaurusContext(),
  });

  console.log(versions);

  switch (versions.currentVersion.label) {
    case '11.x': {
      const href = pathname.replace('/docs', '/docs/v10');
      const v10Doc = versions.versionDict['10.x'].docs.find(
        (x) => x.path === href,
      );

      return (
        <div
          className={clsx(
            ThemeClassNames.docs.docVersionBanner,
            'alert alert--info margin-bottom--md space-y-2',
          )}
          role="alert"
        >
          <p>You are looking at the tRPC version 11 which is in beta.</p>
          <ul className="list-inside list-disc">
            <li>
              To go to v10 documentation,{' '}
              <Link
                href={v10Doc ? v10Doc.path : '/docs/v10'}
                className="font-bold"
              >
                click here
              </Link>
              .
            </li>
            <li>
              To see the pending list of changes for v11,{' '}
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

  // if (!isV10) {
  // return null;
  // return (
  //   <div
  //     className={clsx(
  //       ThemeClassNames.docs.docVersionBanner,
  //       'alert alert--success margin-bottom--md space-y-2',
  //     )}
  //     role="alert"
  //   >
  //     <p className="mb-2">You are looking at the tRPC version 9.</p>
  //     <p>
  //       We have recently released a version 10 beta{' '}
  //       <Link href={pathname.replace('/v9/', '/v10/')} className="font-bold">
  //         click here
  //       </Link>{' '}
  //       to have a look.
  //     </p>
  //   </div>
  // );
  // }

  // TODO - make sure that a v9 version exists of this doc before linking
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
