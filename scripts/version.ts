import fs from 'fs';
import path from 'path';

console.log('ℹ️ Running custom script to pin versions to each other');

const repoVersion = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'lerna.json'), 'utf8'),
).version as string;

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
  .filter((dir) => !dir.startsWith('.'))
  .map((name) => ({
    name,
    packageJSON: path.join(
      import.meta.dirname,
      '..',
      'packages',
      name,
      'package.json',
    ),
  }))
  .filter(({ packageJSON }) => fs.existsSync(packageJSON));

// First pass: settle each package's own version, so the pins below see the
// final version of every dependency regardless of iteration order
const versions = new Map<string, string>();
for (const { name, packageJSON } of packages) {
  let content = fs.readFileSync(packageJSON).toString();

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
      fs.writeFileSync(packageJSON, content);
      console.log(`  🔖 Set ${name} version to ${suffixedVersion}`);
    }
  }

  versions.set(parsed.name, version);
}

// Second pass: pin every @trpc/* dependency to that package's actual version.
// This keeps alpha packages on the stable versions of their dependencies, and
// keeps canary releases pointing at each other rather than the last stable
for (const { name, packageJSON } of packages) {
  const content = fs.readFileSync(packageJSON).toString();

  // matches `"@trpc/*: ".*"` and replaces it with `"@trpc/*: "<version of @trpc/*>""`
  const newContent = content.replace(
    /\"(@trpc\/(?:\w|-)+)\": "(?:[^"]|\\")*"/g,
    (match, depName: string) => {
      const depVersion = versions.get(depName);
      if (!depVersion) {
        console.warn(`  ⚠️ ${name} depends on unknown package ${depName}`);
        return match;
      }
      return `"${depName}": "${depVersion}"`;
    },
  );
  fs.writeFileSync(packageJSON, newContent);
  console.log(`  📍 Pinned ${name} @trpc/* dependencies`);
}
