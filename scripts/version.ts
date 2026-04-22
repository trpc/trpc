import { getWorkspaceVersion, syncWorkspacePackages } from './workspace-version.ts';

console.log('ℹ️ Running custom script to pin versions to each other');

const repoVersion = getWorkspaceVersion();
const changedPackages = syncWorkspacePackages(repoVersion);

if (changedPackages.length === 0) {
  console.log(`  ✅ Workspace packages already match ${repoVersion}`);
} else {
  for (const changedPackage of changedPackages) {
    console.log(
      `  🔖 Set ${changedPackage.name} version to ${changedPackage.version}`,
    );
  }
}

console.log(`  📍 Pinned workspace @trpc/* dependencies to ${repoVersion}`);
