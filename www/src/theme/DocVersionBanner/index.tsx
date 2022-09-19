import Link from '@docusaurus/Link';
import {
  useActivePlugin,
  useDocsData,
} from '@docusaurus/plugin-content-docs/client';
import { useLocation } from '@docusaurus/router';
import { ThemeClassNames } from '@docusaurus/theme-common';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import clsx from 'clsx';
import React from 'react';
import { useVersion } from '../../components/useVersion';

interface DocsData {
  path: string;
  versions: Version[];
  breadcrumbs: boolean;
}

interface Version {
  name: string;
  label: string;
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

export default function DocVersionBannerWrapper(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  props: React.ComponentProps<typeof DocVersionBanner>,
) {
  const { pluginId } = useActivePlugin({ failfast: true });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const data: DocsData = useDocsData(pluginId);
  const { pathname } = useLocation();

  const { isV10 } = useVersion();

  if (!isV10) {
    return null;
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
  }

  // TODO - make sure that a v9 version exists of this doc before linking
  return (
    <>
      <div
        className={clsx(
          ThemeClassNames.docs.docVersionBanner,
          'alert alert--info margin-bottom--md space-y-2',
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
      {/* <DocVersionBanner {...props} /> */}
    </>
  );
}
