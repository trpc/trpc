import fs from 'node:fs';
import path from 'node:path';

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const WORKSPACE_ROOT = path.join(import.meta.dirname, '..');
const ROOT_PACKAGE_JSON_PATH = path.join(WORKSPACE_ROOT, 'package.json');
const PACKAGES_DIRECTORY = path.join(WORKSPACE_ROOT, 'packages');
const INTERNAL_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const PRERELEASE_PACKAGES = new Map<string, 'alpha' | 'beta'>([
  ['openapi', 'alpha'],
]);

function readJsonFile(filePath: string): PackageJson {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageJson;
}

function writeJsonFile(filePath: string, value: PackageJson) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function derivePackageVersion(repoVersion: string, packageName: string) {
  const prereleaseTag = PRERELEASE_PACKAGES.get(packageName);
  if (!prereleaseTag || repoVersion.includes('-')) {
    return repoVersion;
  }

  return `${repoVersion}-${prereleaseTag}`;
}

function getPinnedDependencyVersion(packageVersion: string) {
  return packageVersion.replace(/-.*$/, '');
}

function updateInternalDependencies(
  packageJson: PackageJson,
  dependencyVersion: string,
) {
  for (const field of INTERNAL_DEPENDENCY_FIELDS) {
    const dependencies = packageJson[field];
    if (!dependencies) {
      continue;
    }

    for (const dependencyName of Object.keys(dependencies)) {
      if (!dependencyName.startsWith('@trpc/')) {
        continue;
      }

      dependencies[dependencyName] = dependencyVersion;
    }
  }
}

export function getManagedPackageJsonPaths() {
  const packageDirectories = fs
    .readdirSync(PACKAGES_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((directoryName) => !directoryName.startsWith('.'));

  return [
    ROOT_PACKAGE_JSON_PATH,
    ...packageDirectories.map((directoryName) =>
      path.join(PACKAGES_DIRECTORY, directoryName, 'package.json'),
    ),
  ];
}

export function getWorkspaceVersion() {
  const rootPackageJson = readJsonFile(ROOT_PACKAGE_JSON_PATH);

  if (!rootPackageJson.version) {
    throw new Error(
      'Root package.json must define the workspace version before syncing packages.',
    );
  }

  return rootPackageJson.version;
}

export function setWorkspaceVersion(version: string) {
  const rootPackageJson = readJsonFile(ROOT_PACKAGE_JSON_PATH);
  rootPackageJson.version = version;
  writeJsonFile(ROOT_PACKAGE_JSON_PATH, rootPackageJson);
}

export function syncWorkspacePackages(repoVersion = getWorkspaceVersion()) {
  const changedPackages: Array<{ name: string; version: string }> = [];

  for (const packageJsonPath of getManagedPackageJsonPaths().slice(1)) {
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = readJsonFile(packageJsonPath);
    const packageDirectory = path.basename(path.dirname(packageJsonPath));
    const packageVersion = derivePackageVersion(repoVersion, packageDirectory);
    const dependencyVersion = getPinnedDependencyVersion(packageVersion);

    updateInternalDependencies(packageJson, dependencyVersion);

    if (packageJson.version !== packageVersion) {
      packageJson.version = packageVersion;
      changedPackages.push({
        name: packageJson.name ?? packageDirectory,
        version: packageVersion,
      });
    }

    writeJsonFile(packageJsonPath, packageJson);
  }

  return changedPackages;
}
