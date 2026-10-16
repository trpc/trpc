import { Suspense } from 'react'
import { ChatRoom } from '@/components/chat-room'
import { CreatePlanetForm } from '@/components/create-planet-form'
import { PlanetTable } from '@/components/planet-table'
import { TopBar } from '@/components/top-bar'
import { ReferenceLinks } from '@/components/reference-links'
import { ServerFunction } from '@/components/server-function'
import { PlanetTableSkeleton } from '@/components/planet-table-skeleton'

export default function Home() {
  return (
    <main>
      <div className="wrap">
        <TopBar />

        <header className="hero">
          <h1>oRPC Playground - Typesafe APIs Made Simple 🪄</h1>
        </header>

        <ReferenceLinks />

        <CreatePlanetForm />

        <Suspense fallback={<PlanetTableSkeleton />}>
          <PlanetTable />
        </Suspense>

        <ChatRoom />

        <ServerFunction />
      </div>
    </main>
  )
}
