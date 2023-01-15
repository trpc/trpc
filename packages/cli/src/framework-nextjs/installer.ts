import { findUpSync } from 'find-up';
import fs from 'fs';
import path from 'path';
import { promptCode } from '../utils';
import { writeFileSyncRecursive } from '../utils';
import { NEXTJS_API_HANDLER, SERVER_TRPC_TS, UTILS_TRPC } from './studs';

const getPath = (file: string) => {
  const projectRoot = findUpSync('package.json');
  const usingSrc = fs.existsSync('src');
  const fileName = (usingSrc ? 'src/' : '') + file;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return path.relative(projectRoot!, fileName);
};

export async function nextjs() {
  if (
    await promptCode({
      code: SERVER_TRPC_TS,
      path: getPath('server/trpc.ts'),
    })
  ) {
    writeFileSyncRecursive(getPath('server/trpc.ts'), SERVER_TRPC_TS);
  }
  if (
    await promptCode({
      code: UTILS_TRPC,
      path: getPath('utils/trpc.ts'),
    })
  ) {
    writeFileSyncRecursive(getPath('utils/trpc.ts'), UTILS_TRPC);
  }
  if (
    await promptCode({
      code: NEXTJS_API_HANDLER,
      path: getPath('pages/api/trpc/[trpc].ts'),
    })
  ) {
    writeFileSyncRecursive(
      getPath('pages/api/trpc/[trpc].ts'),
      NEXTJS_API_HANDLER,
    );
  }
}
