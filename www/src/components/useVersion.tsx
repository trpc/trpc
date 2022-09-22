import { useLocation } from '@docusaurus/router';
import { useDocsPreferredVersion } from '@docusaurus/theme-common';
import { useCallback } from 'react';

type Version = 'current' | '9.x';
export function useVersion() {
  const { preferredVersion, savePreferredVersionName } =
    useDocsPreferredVersion();
  const location = useLocation();

  const isV10 =
    (preferredVersion?.name as Version) !== '9.x' &&
    !location.pathname.startsWith('/docs/v9');

  return {
    savePreferredVersionName: useCallback(
      (version: Version) => {
        savePreferredVersionName(version);
      },
      [savePreferredVersionName],
    ),
    isV10,
  };
}
