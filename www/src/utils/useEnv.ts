/* eslint-disable @typescript-eslint/no-non-null-assertion */
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export function useEnv() {
  const { siteConfig } = useDocusaurusContext();
  const customFields = siteConfig.customFields!;

  const env = customFields.env;

  return env as ReturnType<typeof import('./env')['parseEnv']>;
}
