import * as z from 'zod'

export type CreatingPlanet = z.infer<typeof CreatingPlanetSchema>
export type Planet = z.infer<typeof PlanetSchema>

export const CreatingPlanetSchema = z.object({
  name: z.string().min(4),
  description: z.string().optional(),
  image: z.file().mime(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']).optional(),
}).meta({ id: 'CreatingPlanet' })

export const PlanetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().optional(),
  image: z.uuid().optional(),
}).meta({ id: 'Planet' })
