import fs from 'fs';
import path from 'path';

console.log('ℹ️ Running custom script to pin versions to each other');
const packages = fs
  .readdirSync(path.join(__dirname, '..', 'packages'), { withFileTypes: true })
  .filter((file) => file.isDirectory())
  .map((dir) => dir.name)
  .filter((dir) => !dir.startsWith('.'));

for (const name of packages) {
  const packageJSON = path.join(
    __dirname,
    '..',
    'packages',
    name,
    'package.json',
  );
  if (!fs.existsSync(packageJSON)) {
    continue;
  }

  const content = fs.readFileSync(packageJSON).toString();

  // matches `"@trpc/*: "^` and replaces it with `"@trpc/*: "`
  const newContent = content.replace(/\"@trpc\/(\w+)\": "\^/g, `"@trpc/$1": "`);
  fs.writeFileSync(packageJSON, newContent);
  console.log(`  📍 Pinned ${name} @trpc/* dependencies`);
}
