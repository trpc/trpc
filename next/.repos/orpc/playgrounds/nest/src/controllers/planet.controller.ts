import { Controller } from '@nestjs/common'
import { Implement } from '@orpc/nest'
import { call, implement } from '@orpc/server'
import { contract } from '../contracts'
import { deleteFile, uploadFile } from '../routers/file'
import { Planet } from '../schemas/planet'

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

@Controller()
export class PlanetController {
  constructor() {}

  @Implement(contract.planet.list)
  list() {
    return implement(contract.planet.list).handler(async (_, { keyword, cursor, limit }) => {
      const planets = keyword !== undefined
        ? DB.filter(p => p.name.includes(keyword) || p.description?.includes(keyword))
        : DB

      return planets.slice(cursor, cursor + limit)
    })
  }

  @Implement(contract.planet.find)
  find() {
    return implement(contract.planet.find).handler(({ input, errors }) => {
      const planet = DB.find(p => p.id === input.id)

      if (!planet) {
        throw errors.NOT_FOUND()
      }

      return planet
    })
  }

  @Implement(contract.planet.create)
  create() {
    return implement(contract.planet.create).handler(async ({ input, context }) => {
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
  }

  @Implement(contract.planet.update)
  update() {
    return implement(contract.planet.update).handler(async ({ input, errors, context }) => {
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
  }

  @Implement(contract.planet.delete)
  delete() {
    return implement(contract.planet.delete).handler(async ({ input, context }) => {
      const index = DB.findIndex(p => p.id === input.id)

      if (index >= 0) {
        const [planet] = DB.splice(index, 1)

        if (planet.image) {
          await call(deleteFile, { id: planet.image }, { context })
        }
      }
    })
  }
}
