import * as z from 'zod'
import type { RouterContractClient } from '@orpc/contract'
import { oc } from '@orpc/contract'
import { implement } from '@orpc/server'

const PlanetSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
})

export const listPlanetsContract = oc
  .output(z.array(PlanetSchema))

export const findPlanetContract = oc
  .input(z.object({ id: z.number() }))
  .output(PlanetSchema)

export const createPlanetContract = oc
  .input(z.object({ name: z.string(), description: z.string().optional() }))
  .output(PlanetSchema)

export const contract = {
  planet: {
    list: listPlanetsContract,
    find: findPlanetContract,
    create: createPlanetContract,
  },
}

const os = implement(contract)

export const listPlanets = os.planet.list
  .handler(async () => {
    return [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]
  })

export const findPlanet = os.planet.find
  .handler(async ({ input }) => {
    return { id: input.id, name: 'Earth' }
  })

export const createPlanet = os.planet.create
  .handler(async ({ input }) => {
    return { id: 3, ...input }
  })

export const router = os.router({
  planet: {
    list: listPlanets,
    find: findPlanet,
    create: createPlanet,
  },
})

export const client = {} as RouterContractClient<typeof contract>
