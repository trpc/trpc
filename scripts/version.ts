import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('ℹ️ Running custom script to pin versions to each other');

const repoRoot = path.join(import.meta.dirname, '..');
const repoVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'lerna.json'), 'utf8'),
).version as string;

// Packages that should have a prerelease suffix (alpha or beta)
const PRERELEASE_PACKAGES = new Map<string, 'alpha' | 'beta'>([
  ['openapi', 'alpha'],
]);

const packages = fs
  .readdirSync(path.join(repoRoot, 'packages'), {
    withFileTypes: true,
  })
  .filter((file) => file.isDirectory())
  .map((dir) => dir.name)
  .filter((dir) => !dir.startsWith('.'));

const changedPackageJSONs: string[] = [];

for (const name of packages) {
  const packageJSON = path.join(repoRoot, 'packages', name, 'package.json');
  if (!fs.existsSync(packageJSON)) {
    continue;
  }

  let content = fs.readFileSync(packageJSON).toString();
  const originalContent = content;

  const parsed = JSON.parse(content);
  let version = parsed.version ?? repoVersion;

  // Ensure designated packages always have their prerelease suffix
  const prereleaseTag = PRERELEASE_PACKAGES.get(name);
  if (prereleaseTag && !version.includes('-')) {
    const baseVersion = version.replace(/-.*$/, '');
    const suffixedVersion = `${baseVersion}-${prereleaseTag}`;
    if (version !== suffixedVersion) {
      content = content.replace(
        `"version": "${version}"`,
        `"version": "${suffixedVersion}"`,
      );
      version = suffixedVersion;
      console.log(`  🔖 Set ${name} version to ${suffixedVersion}`);
    }
  }

  // For dependency pinning, use the base version (without prerelease suffix)
  // so alpha packages correctly depend on the stable versions of other @trpc/* packages
  const depVersion = version.replace(/-.*$/, '');
  // matches `"@trpc/*: ".*"` and replaces it with `"@trpc/*: "${depVersion}""`
  const newContent = content.replace(
    /\"@trpc\/((\w|-)+)\": "([^"]|\\")*"/g,
    `"@trpc/$1": "${depVersion}"`,
  );

  if (newContent !== originalContent) {
    fs.writeFileSync(packageJSON, newContent);
    changedPackageJSONs.push(path.relative(repoRoot, packageJSON));
    console.log(`  📍 Pinned ${name} @trpc/* dependencies`);
  }
}

if (
  process.env['npm_lifecycle_event'] === 'version' &&
  changedPackageJSONs.length > 0
) {
  // Lerna stages its own version files, but this hook also updates private
  // workspace package manifests. Stage those changes so the release commit and
  // lockfile stay in sync.
  execFileSync('git', ['add', '--', ...changedPackageJSONs], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}
