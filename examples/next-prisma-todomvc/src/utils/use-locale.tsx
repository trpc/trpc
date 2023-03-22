import { useTranslation } from 'next-i18next';

export const useLocale = (
  namespace: Parameters<typeof useTranslation>[0] = 'common',
) => useTranslation(namespace);
