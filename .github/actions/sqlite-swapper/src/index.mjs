import fs from 'fs';
import path from 'path';

const BASE_PATH = process.env.DIR;
console.log(process.env.DIR);
const PRISMA_PATH = 'prisma/schema.prisma';
const REPLACE_DBS = ['postgres', 'mysql'];
const SQLITE_DB_NAME = '"file:./dev.db"';
const OUT_PATH = 'prisma/schema.prisma';

// create directories on the way if they dont exist
function writeFileSyncRecursive(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function commentBlock(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].startsWith('}')) {
      lines[i] = `// ${lines[i]}`;
      break;
    }
    lines[i] = `// ${lines[i]}`;
  }
}

async function run() {
  const cwd = BASE_PATH;
  const prismaPath = path.join(cwd, PRISMA_PATH);
  const prisma = fs.readFileSync(prismaPath, 'utf8');

  const lines = prisma
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean); // Remove empty lines

  // Find all enums
  let enumRefs = new Set(
    lines
      .map((line, i) => {
        if (line.toLowerCase().startsWith('enum')) {
          commentBlock(lines, i);
          return line.split(' ')[1];
        }
      })
      .filter(Boolean),
  );

  console.log(enumRefs);

  const transformed = lines
    .map((line, i) => {
      const tokens = line.split(' ').filter(Boolean);
      if (tokens[0].startsWith('//')) {
        return line;
      }

      // Set the provider to sqlite
      if (
        tokens[0] === 'provider' &&
        REPLACE_DBS.includes(tokens[2].replace(/"/g, ''))
      ) {
        tokens[2] = '"sqlite"';
      }
      // Set the url to a file
      if (tokens[0] === 'url') {
        tokens[2] = SQLITE_DB_NAME;
      }

      // Replace all usages of the enums with strings
      if (enumRefs.has(tokens[1])) {
        tokens[1] = 'String';
      }

      return tokens.join(' ');
    })
    .join('\n');

  const outPath = path.join(cwd, OUT_PATH);
  writeFileSyncRecursive(outPath, transformed);

  console.log('Successfully transformed prisma schema to sqlite');
}

run();
