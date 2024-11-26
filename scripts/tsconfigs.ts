import fs from 'fs';
import path from 'path';
import url from 'url';
import fg from 'fast-glob';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Read the base tsconfig
const baseConfig = fs.readFileSync(
  path.resolve(rootDir, 'tsconfig.package.json'),
  'utf8',
);

// Find all package.json files in the packages directory
const packagePaths = fg.sync(['packages/*/package.json'], {
  cwd: rootDir,
  absolute: true,
});

// Process each package
for (const packagePath of packagePaths) {
  const packageDir = path.dirname(packagePath);
  // Skip the tests package
  if (path.basename(packageDir) === 'tests') {
    continue;
  }

  // Write the tsconfig file
  const tsconfigPath = path.resolve(packageDir, 'tsconfig.json');
  fs.writeFileSync(tsconfigPath, baseConfig);
}
