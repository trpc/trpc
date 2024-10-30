import fs from 'fs';
import path from 'path';

console.log('ℹ️ Running custom script to pin versions to each other');

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

  const content = fs.readFileSync(packageJSON).toString();

  const version = JSON.parse(content).version;
  // matches `"@trpc/*: ".*"` and replaces it with `"@trpc/*: "${version}""`
  const newContent = content.replace(
    /\"@trpc\/((\w|-)+)\": "([^"]|\\")*"/g,
    `"@trpc/$1": "${version}"`,
  );
  fs.writeFileSync(packageJSON, newContent);
  console.log(`  📍 Pinned ${name} @trpc/* dependencies`);
}
