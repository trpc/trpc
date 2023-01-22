import { findUpSync } from 'find-up';
import { readFileSync } from 'fs';
import path from 'path';
import type { PackageJson } from 'type-fest';
import { getVersion, logger } from './utils';

const detectFramework = (projectRoot: string) => {
  const packageJsonPath = path.join(projectRoot, 'package.json');

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
  const pkgJsonPath = findUpSync('package.json');
  if (!pkgJsonPath) {
    logger.error('Could not find `package.json`.');
    process.exit(1);
  }
  const projectRoot = path.parse(pkgJsonPath).dir;

  console.log('');
  logger.info(`v${getVersion()}`);
  const framework = detectFramework(projectRoot);
  console.log('');

  switch (framework) {
    case 'nextjs':
      await import('./framework-nextjs/installer').then((m) =>
        m.nextjs({ projectRoot }),
      );
      break;
    case 'react':
      logger.error('Not implemented yet.');
      process.exit(1);
      break;
  }

  console.log('');
  logger.info('Done!');
})();
