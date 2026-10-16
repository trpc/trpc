import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import z from 'zod'
import { bearAuthMeta } from '../meta'
import { CreatingPlanetSchema, PlanetSchema } from '../schemas/planet'

export const listPlanets = oc
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

export const findPlanet = oc
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

export const createPlanet = oc
  .meta(bearAuthMeta)
  .meta(openapi({
    method: 'POST',
    path: '/planets',
    summary: 'Create a new planet',
    tags: ['Planet'],
  }))
  .input(CreatingPlanetSchema)
  .output(PlanetSchema)

export const updatePlanet = oc
  .meta(bearAuthMeta)
  .meta(openapi({
    method: 'PUT',
    path: '/planets/{id}',
    summary: 'Update an existing planet',
    tags: ['Planet'],
  }))
  .input(CreatingPlanetSchema.extend({ id: PlanetSchema.shape.id }))
  .output(PlanetSchema)
  .errors({ NOT_FOUND: { message: 'Planet not found' } })

export const deletePlanet = oc
  .meta(bearAuthMeta)
  .meta(openapi({
    method: 'DELETE',
    path: '/planets/{id}',
    summary: 'Delete a planet',
    tags: ['Planet'],
  }))
  .input(z.object({
    id: PlanetSchema.shape.id,
  }))
