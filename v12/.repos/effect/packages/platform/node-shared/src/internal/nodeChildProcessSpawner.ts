import type * as ChildProcess from "effect/process/ChildProcess"
import type * as NodeChildProcess from "node:child_process"

export const buildSpawnOptions = (
  options: ChildProcess.CommandOptions,
  base: Pick<NodeChildProcess.SpawnOptions, "cwd" | "env" | "stdio">,
  platform: NodeJS.Platform
): NodeChildProcess.SpawnOptions => {
  const detached = options.detached ?? platform !== "win32"
  return {
    ...base,
    detached,
    shell: options.shell,
    windowsHide: options.windowsHide ?? !detached
  }
}
