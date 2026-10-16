import { protectedOS, publicOS } from '../orpc'
import { CreatingPlanetSchema, PlanetSchema } from '../schemas/planet'
import type { Planet } from '../schemas/planet'
import z from 'zod'
import { openapi } from '@orpc/openapi'
import { call } from '@orpc/server'
import { deleteFile, uploadFile } from './file'

const DB: Planet[] = [
  {
    id: 'bcf900e3-2f66-4a03-aa6c-6336eb601630',
    name: 'Earth',
    description: 'The planet Earth',
  },
  {
    id: 'eb9f4084-f06f-4b59-aeb5-2341e5051619',
    name: 'Mars',
    description: 'The planet Mars',
  },
]

export const listPlanets = publicOS
  .meta(openapi({
    method: 'GET',
    path: '/planets',
    summary: 'List all planets',
    tags: ['Planet'],
  }))
  .input(z.object({
    keyword: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(10),
    cursor: z.number().int().min(0).default(0),
  }))
  .output(z.array(PlanetSchema))
  .handler(async (_, { keyword, cursor, limit }) => {
    const planets = keyword !== undefined
      ? DB.filter(p => p.name.includes(keyword) || p.description?.includes(keyword))
      : DB

    return planets.slice(cursor, cursor + limit)
  })

export const findPlanet = publicOS
  .meta(openapi({
    method: 'GET',
    path: '/planets/{id}',
    summary: 'Find a planet',
    tags: ['Planet'],
  }))
  .input(z.object({
    id: PlanetSchema.shape.id,
  }))
  .output(PlanetSchema)
  .errors({ NOT_FOUND: { message: 'Planet not found' } })
  .handler(({ input, errors }) => {
    const planet = DB.find(p => p.id === input.id)

    if (!planet) {
      throw errors.NOT_FOUND()
    }

    return planet
  })

export const createPlanet = protectedOS
  .meta(openapi({
    method: 'POST',
    path: '/planets',
    summary: 'Create a new planet',
    tags: ['Planet'],
  }))
  .input(CreatingPlanetSchema)
  .output(PlanetSchema)
  .handler(async ({ input, context }) => {
    const planet: Planet = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
    }

    if (input.image) {
      const uploaded = await call(uploadFile, input.image, { context })
      planet.image = uploaded.id
    }

    DB.push(planet)

    return planet
  })

export const updatePlanet = protectedOS
  .meta(openapi({
    method: 'PUT',
    path: '/planets/{id}',
    summary: 'Update an existing planet',
    tags: ['Planet'],
  }))
  .input(CreatingPlanetSchema.extend({ id: PlanetSchema.shape.id }))
  .output(PlanetSchema)
  .errors({ NOT_FOUND: { message: 'Planet not found' } })
  .handler(async ({ input, errors, context }) => {
    const planet = DB.find(p => p.id === input.id)

    if (!planet) {
      throw errors.NOT_FOUND()
    }

    planet.name = input.name
    planet.description = input.description

    if (planet.image) {
      await call(deleteFile, { id: planet.image }, { context })
    }

    if (input.image) {
      const uploaded = await call(uploadFile, input.image, { context })
      planet.image = uploaded.id
    }

    return planet
  })

export const deletePlanet = protectedOS
  .meta(openapi({
    method: 'DELETE',
    path: '/planets/{id}',
    summary: 'Delete a planet',
    tags: ['Planet'],
  }))
  .input(z.object({
    id: PlanetSchema.shape.id,
  }))
  .handler(async ({ input, context }) => {
    const index = DB.findIndex(p => p.id === input.id)

    if (index >= 0) {
      const [planet] = DB.splice(index, 1)

      if (planet?.image) {
        await call(deleteFile, { id: planet.image }, { context })
      }
    }
  })
