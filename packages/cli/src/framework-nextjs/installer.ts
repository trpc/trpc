import fs from 'fs';
import path from 'path';
import { Project } from 'ts-morph';
import { promptAndInstallDeps, promptCode } from '../utils';
import { writeFileSyncRecursive } from '../utils';
import {
  APP_ROUTER,
  NEXTJS_API_HANDLER,
  NEXTJS_CONTEXT,
  NEXTJS_PAGES_APP,
  SERVER_TRPC_TS,
  UTILS_TRPC,
} from './studs';

const getPath = (opts: {
  fileName: string;
  skipSrc?: boolean;
  projectRoot: string;
}) => {
  const usingSrc = opts.skipSrc
    ? false
    : fs.existsSync(path.join(opts.projectRoot, 'src'));
  return path.relative(
    opts.projectRoot,
    path.join(opts.projectRoot, usingSrc ? 'src' : '', opts.fileName),
  );
};

const curriedGetPath =
  (projectRoot: string) => (fileName: string, skipSrc?: boolean) =>
    getPath({ fileName, projectRoot, skipSrc });

export async function nextjs(opts: { projectRoot: string }) {
  await promptAndInstallDeps({
    deps: [
      'zod',
      '@trpc/server',
      '@trpc/next',
      '@trpc/react-query',
      '@trpc/client',
      '@tanstack/react-query',
    ],
    projectRoot: opts.projectRoot,
  });

  const getPath = curriedGetPath(opts.projectRoot);

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

  if (
    await promptCode({
      code: APP_ROUTER,
      path: getPath('server/routers/_app.ts'),
      mode: 'CREATE',
    })
  ) {
    writeFileSyncRecursive(getPath('server/routers/_app.ts'), APP_ROUTER);
  }

  if (
    await promptCode({
      code: NEXTJS_CONTEXT,
      path: getPath('server/context.ts'),
      mode: 'CREATE',
    })
  ) {
    writeFileSyncRecursive(getPath('server/context.ts'), NEXTJS_CONTEXT);
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
    const source = _app.getText();
    // Remove the `export default` and wrap compenent in `trpc.withTRPC`
    _app.addImportDeclaration({
      moduleSpecifier: '~/utils/trpc',
      namedImports: ['trpc'],
    });

    const defaultExport = _app
      .getDefaultExportSymbol()
      ?.getFullyQualifiedName()
      .split('.')[1];
    _app.removeDefaultExport();
    _app.addStatements(`export default trpc.withTRPC(${defaultExport})`);

    if (
      await promptCode({
        code: _app.getText(),
        path: _app.getFilePath(),
        mode: 'EDIT',
        input: source,
      })
    )
      await _app.save();
  }
}
