import { spawn } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"

// The leader and descendant share a process group and inherited stdio. The
// leader exits immediately on SIGTERM unless a delay is supplied. The descendant
// exits after its delay (200ms by default) or ignores SIGTERM and writes heartbeats.
const [role, mode, marker, leaderDelay = "0", descendantDelay = "200"] = process.argv.slice(2)

if (role === "leader") {
  spawn(process.execPath, [process.argv[1], "descendant", mode, marker, leaderDelay, descendantDelay], {
    stdio: ["ignore", "inherit", "inherit"]
  })
  if (Number(leaderDelay) > 0) {
    process.on("SIGTERM", () => setTimeout(() => process.exit(0), Number(leaderDelay)))
  }
  process.stdin.once("data", (data) => process.exit(data.toString().trim() === "exit 1" ? 1 : 0))
  setInterval(() => {}, 1_000)
} else {
  if (mode === "exit-on-signal") {
    process.on("SIGTERM", () => {
      setTimeout(() => {
        writeFileSync(marker, "exited")
        process.exit(0)
      }, Number(descendantDelay))
    })
  } else {
    process.on("SIGTERM", () => {})
    appendFileSync(marker, "x")
    setInterval(() => appendFileSync(marker, "x"), 10)
  }
  setTimeout(() => process.exit(1), 5_000)
  process.stdout.write(`READY ${process.pid}\n`)
}
