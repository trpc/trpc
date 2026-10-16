import * as z from 'zod'
import type { RouterClient } from '@orpc/server'
import { os } from '@orpc/server'

export const listPlanets = os
  .handler(async () => {
    return [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]
  })

export const findPlanet = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => {
    return { id: input.id, name: 'Earth' }
  })

export const createPlanet = os
  .input(z.object({ name: z.string(), description: z.string().optional() }))
  .handler(async ({ input }) => {
    return { id: 3, ...input }
  })

export const router = {
  planet: {
    list: listPlanets,
    find: findPlanet,
    create: createPlanet,
  },
}

export const client = {} as RouterClient<typeof router>
