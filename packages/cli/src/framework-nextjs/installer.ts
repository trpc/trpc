import { findUpSync } from 'find-up';
import fs from 'fs';
import path from 'path';
import { Project } from 'ts-morph';
import { promptCode } from '../utils';
import { writeFileSyncRecursive } from '../utils';
import {
  NEXTJS_API_HANDLER,
  NEXTJS_PAGES_APP,
  SERVER_TRPC_TS,
  UTILS_TRPC,
} from './studs';

const getPath = (file: string, skipSrc?: boolean) => {
  const projectRoot = path.parse(findUpSync('package.json') as string).dir;
  const usingSrc = skipSrc ? false : fs.existsSync('src');
  const fileName = (usingSrc ? 'src/' : '') + file;
  return path.relative(projectRoot, fileName);
};

export async function nextjs() {
  if (
    await promptCode({
      code: SERVER_TRPC_TS,
      path: getPath('server/trpc.ts'),
      mode: 'CREATE',
    })
  ) {
    writeFileSyncRecursive(getPath('server/trpc.ts'), SERVER_TRPC_TS);
  }
  if (
    await promptCode({
      code: UTILS_TRPC,
      path: getPath('utils/trpc.ts'),
      mode: 'CREATE',
    })
  ) {
    writeFileSyncRecursive(getPath('utils/trpc.ts'), UTILS_TRPC);
  }
  if (
    await promptCode({
      code: NEXTJS_API_HANDLER,
      path: getPath('pages/api/trpc/[trpc].ts'),
      mode: 'CREATE',
    })
  ) {
    writeFileSyncRecursive(
      getPath('pages/api/trpc/[trpc].ts'),
      NEXTJS_API_HANDLER,
    );
  }

  // For files that may already exist, we just want to modify them using ts-morph
  const project = new Project({
    tsConfigFilePath: getPath('tsconfig.json', true),
  });
  const files = project.getSourceFiles();
  const _app = files.find((f) => f.getBaseName() === '_app.tsx');
  if (!_app) {
    if (
      await promptCode({
        code: NEXTJS_PAGES_APP,
        path: getPath('pages/_app.tsx'),
        mode: 'CREATE',
      })
    ) {
      writeFileSyncRecursive(getPath('pages/_app.tsx'), NEXTJS_PAGES_APP);
    }
  } else {
    // Remove the `export default` and wrap compenent in `trpc.withTRPC`
    _app.addImportDeclaration({
      moduleSpecifier: '~/utils/trpc',
      namedImports: ['trpc'],
    });
    _app.removeDefaultExport();
    _app.addStatements(`export default trpc.withTRPC(App)`); // FIXME: dont hardcode `App`

    if (
      await promptCode({
        code: _app.getText(),
        path: _app.getFilePath(),
        mode: 'EDIT',
      })
    )
      await _app.save();
  }
}
