import { implement } from '@orpc/server'
import { contract } from '../contracts'

const FILES = new Map<string, File>()

export const uploadFile = implement(contract.file.upload)
  .handler(({ input }) => {
    const id = crypto.randomUUID()
    FILES.set(id, input)
    return { id }
  })

export const deleteFile = implement(contract.file.delete)
  .handler(({ input }) => {
    FILES.delete(input.id)
  })

export const findFile = implement(contract.file.find)
  .handler(({ input, errors }) => {
    const file = FILES.get(input.id)

    if (!file) {
      throw errors.NOT_FOUND()
    }

    return file
  })
