/* eslint-disable @typescript-eslint/no-non-null-assertion */
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import type { parseEnv } from './env';

type Env = ReturnType<typeof parseEnv>;

export function useEnv() {
  const { siteConfig } = useDocusaurusContext();
  const customFields = siteConfig.customFields!;

  const env = customFields.env;

  return env as Env;
}
