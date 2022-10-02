import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ "use strict";
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "fs"
const external_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("fs");
;// CONCATENATED MODULE: external "path"
const external_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("path");
;// CONCATENATED MODULE: ./src/index.mjs



const EXAMPLE_PATH = process.env.DIR;
const PRISMA_PATH = 'prisma/schema.prisma';
const REPLACE_DBS = ['postgres', 'mysql'];
const SQLITE_DB_NAME = '"file:./dev.db"';
const OUT_PATH = 'prisma/schema.prisma';

// create directories on the way if they dont exist
function writeFileSyncRecursive(filePath, content) {
  const dir = external_path_namespaceObject.dirname(filePath);
  if (!external_fs_namespaceObject.existsSync(dir)) {
    external_fs_namespaceObject.mkdirSync(dir, { recursive: true });
  }
  external_fs_namespaceObject.writeFileSync(filePath, content, 'utf8');
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
  const cwd = external_path_namespaceObject.join(process.cwd(), EXAMPLE_PATH);
  console.log('CWD: ', cwd);
  const prismaPath = external_path_namespaceObject.join(cwd, PRISMA_PATH);
  const prisma = external_fs_namespaceObject.readFileSync(prismaPath, 'utf8');

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

  const outPath = external_path_namespaceObject.join(cwd, OUT_PATH);
  writeFileSyncRecursive(outPath, transformed);

  console.log('Successfully transformed prisma schema to sqlite');
}

run();

