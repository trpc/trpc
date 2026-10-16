'use client'

import { useEffect, useState } from 'react'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function TopBar() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60

  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" />
        <a href="https://orpc.dev" target="_blank">orpc.dev</a>
        mission console
      </div>
      <div className="mission-time">
        {`T+${pad(h)}:${pad(m)}:${pad(s)}`}
      </div>
    </div>
  )
}
