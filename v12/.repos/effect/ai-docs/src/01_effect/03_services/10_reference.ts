/**
 * @title Context.Reference
 *
 * For defining configuration values, feature flags, or any other service that has a default value.
 */
import { Context } from "effect"

export const FeatureFlag = Context.Reference<boolean>("myapp/FeatureFlag", {
  defaultValue: () => false
})
