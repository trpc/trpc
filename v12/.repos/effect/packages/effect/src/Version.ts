/**
 * The `effect` package version used in telemetry headers, resources, and scopes.
 *
 * @stability unstable
 * @since 4.0.2
 */
import { version } from "./internal/version.ts"

let currentVersion: string = version

/**
 * Returns the current version of the `effect` package.
 *
 * **Details**
 *
 * Defaults to the release version unless overridden by `setCurrentVersion`.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.2
 */
export const getCurrentVersion = (): string => currentVersion

/**
 * Overrides the version returned by `getCurrentVersion`.
 *
 * **Gotchas**
 *
 * Applies to this copy of the module. Existing telemetry layers retain the
 * version they read when built.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.2
 */
export const setCurrentVersion = (version: string): void => {
  currentVersion = version
}
