import { findUpSync } from 'find-up';
import { readFileSync } from 'fs';
import type { PackageJson } from 'type-fest';
import { logger } from './utils';

const detectFramework = () => {
  const packageJsonPath = findUpSync('package.json');
  if (!packageJsonPath) {
    logger.error('Failed to find package.json required to detect framework.');
    process.exit(1);
  }
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageJson;

  if (packageJson.dependencies?.next) {
    logger.info('Detected framework `Next.js`.');
    return 'nextjs';
  }
  if (packageJson.dependencies?.react) {
    logger.info('Detected framework `React`.');
    return 'react';
  }
  logger.error(
    "Failed to detect framework. Supported frameworks: 'nextjs' & 'react'.",
  );
  process.exit(1);
};

await (async () => {
  const framework = detectFramework();

  switch (framework) {
    case 'nextjs':
      await import('./framework-nextjs/installer').then((m) => m.nextjs());
      break;
    case 'react':
      logger.error('Not implemented yet.');
      process.exit(1);
      break;
  }

  console.log('');
  logger.info('Done!');
})();
