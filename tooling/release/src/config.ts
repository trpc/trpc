/**
 * The major every release publishes. A release that would publish any other
 * major fails, so v12 starts with a pull request that sets this to 12. Once
 * it's merged, the automatic release skips, and the next run of the Release
 * Packages workflow by hand (`latest`, either bump) releases v12.0.0. After
 * that, releases are v12 patches and minors; v13 takes another pull request.
 */
export const releaseMajor = 11;
