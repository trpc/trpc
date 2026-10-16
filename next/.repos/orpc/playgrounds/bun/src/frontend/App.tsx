import { Suspense } from 'react'
import { CreatePlanetForm } from '../components/create-planet-form'
import { ReferenceLinks } from '../components/reference-links'
import { TopBar } from '../components/top-bar'
import './global.css'
import { PlanetTableSkeleton } from '../components/planet-table-skeleton'
import { PlanetTable } from '../components/planet-table'
import { ChatRoom } from '../components/chat-room'

export function App() {
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
      </div>
    </main>
  )
}

export default App
