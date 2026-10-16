import { OpenAPISerializer } from '@orpc/openapi'
import { bench } from 'vitest'
import { handlers, PAYLOAD_1KB, PAYLOAD_5MB, PAYLOAD_5MB_WITH_FILES, PAYLOAD_100KB } from './__shared__/payloads'

const serializer = new OpenAPISerializer({ handlers })

describe('openapi serializer', () => {
  bench('1KB payload', () => {
    serializer.deserialize(
      serializer.serialize(PAYLOAD_1KB),
    )
  })

  bench('100KB payload', () => {
    serializer.deserialize(
      serializer.serialize(PAYLOAD_100KB),
    )
  })

  bench('5MB payload', () => {
    serializer.deserialize(
      serializer.serialize(PAYLOAD_5MB),
    )
  })

  bench('5MB payload with files', () => {
    serializer.deserialize(
      serializer.serialize(PAYLOAD_5MB_WITH_FILES),
    )
  })
})
