import { spawn } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"

// The leader and descendant share a process group and inherited stdio. The
// leader keeps the default SIGTERM behavior. The descendant either exits 200ms
// after SIGTERM or ignores it while writing heartbeats to the marker file.
const [role, mode, marker] = process.argv.slice(2)

if (role === "leader") {
  spawn(process.execPath, [process.argv[1], "descendant", mode, marker], {
    stdio: ["ignore", "inherit", "inherit"]
  })
  process.stdin.once("data", (data) => process.exit(data.toString().trim() === "exit 1" ? 1 : 0))
  setInterval(() => {}, 1_000)
} else {
  if (mode === "exit-on-signal") {
    process.on("SIGTERM", () => {
      setTimeout(() => {
        writeFileSync(marker, "exited")
        process.exit(0)
      }, 200)
    })
  } else {
    process.on("SIGTERM", () => {})
    appendFileSync(marker, "x")
    setInterval(() => appendFileSync(marker, "x"), 10)
  }
  setTimeout(() => process.exit(1), 5_000)
  process.stdout.write(`READY ${process.pid}\n`)
}
