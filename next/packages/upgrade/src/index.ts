export { upgradeCommand } from './cli.ts';
export { upgradeFiles, type FileUpgrade } from './files.ts';
export {
  PROMOTED,
  PROMOTED_PACKAGES,
  type PromotedPackage,
} from './promoted.ts';
export {
  upgradeSource,
  type UpgradeNote,
  type UpgradeOptions,
  type UpgradeResult,
} from './transform.ts';
