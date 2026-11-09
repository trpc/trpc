import * as Duration from "../../Duration.ts"
import type { ShardingConfig } from "../ShardingConfig.ts"

/**
 * @internal
 */
export const effectiveInterval = (config: ShardingConfig["Service"]): Duration.Duration =>
  Duration.min(
    Duration.fromInputUnsafe(config.shardLockRefreshInterval),
    Duration.divideUnsafe(Duration.fromInputUnsafe(config.shardLockExpiration), 3)
  )
