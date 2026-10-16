import { openapi } from '@orpc/openapi'

export const bearAuthMeta = openapi({
  spec: current => ({
    ...current,
    security: [{ bearerAuth: [] }],
  }),
})
