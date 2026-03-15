import fs from 'fs';
import path from 'path';

console.log('ℹ️ Running custom script to pin versions to each other');

// Packages that should have a prerelease suffix (alpha or beta)
const PRERELEASE_PACKAGES = new Map<string, 'alpha' | 'beta'>([
  ['openapi', 'alpha'],
]);

const packages = fs
  .readdirSync(path.join(import.meta.dirname, '..', 'packages'), {
    withFileTypes: true,
  })
  .filter((file) => file.isDirectory())
  .map((dir) => dir.name)
  .filter((dir) => !dir.startsWith('.'));

for (const name of packages) {
  const packageJSON = path.join(
    import.meta.dirname,
    '..',
    'packages',
    name,
    'package.json',
  );
  if (!fs.existsSync(packageJSON)) {
    continue;
  }

  let content = fs.readFileSync(packageJSON).toString();

  const parsed = JSON.parse(content);
  let version = parsed.version;

  // Ensure designated packages always have their prerelease suffix
  const prereleaseTag = PRERELEASE_PACKAGES.get(name);
  if (prereleaseTag) {
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
  fs.writeFileSync(packageJSON, newContent);
  console.log(`  📍 Pinned ${name} @trpc/* dependencies`);
}
