/**
 * The major every release publishes. A release that would publish any other
 * major fails, so v12 starts with a pull request that sets this to 12. Once
 * it's merged, the automatic release publishes v12.0.0. After that, releases
 * are v12 patches and minors; v13 takes another pull request.
 */
export const releaseMajor = 11;

/**
 * Full shas of commits on `main` whose subject is marked breaking (`feat!:`)
 * by mistake. The automatic release fails on a breaking commit unless
 * `releaseMajor` is the next major; listing one here releases it by its type
 * instead, `feat` as a minor and anything else as a patch.
 */
export const notBreaking: ReadonlyArray<string> = [];
