import findPkgs from 'find-packages';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const packages = await findPkgs(path.join(__dirname, '..'), {
    dot: true,
  } as any);

  const prismaClientPath = path.join(require.resolve('@prisma/client'), '..');
  await Promise.all(
    packages
      .filter((pkg) => '@prisma/client' in (pkg.manifest.dependencies ?? {}))
      .map(async (pkg) => {
        const prismaNamespacePath = path.join(
          pkg.dir,
          'node_modules',
          '@prisma',
        );
        const pkgPrismaClientPath = path.join(prismaNamespacePath, 'client');

        await fs.rm(path.join(prismaNamespacePath, '.ignored_client'), {
          force: true,
          recursive: true,
        });
        if ((await fs.lstat(pkgPrismaClientPath)).isSymbolicLink()) {
          await fs.unlink(pkgPrismaClientPath);
        }
        await fs.mkdir(pkgPrismaClientPath, { recursive: true });
        await fs.cp(prismaClientPath, pkgPrismaClientPath, {
          force: true,
          recursive: true,
        });
      }),
  );
}

void main();
