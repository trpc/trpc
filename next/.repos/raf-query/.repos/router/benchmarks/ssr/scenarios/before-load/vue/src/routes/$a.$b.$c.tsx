import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { makeBeforeLoadMarker, type BeforeLoadContext } from '../../../shared'

const LevelCComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => <main>{data.value.marker}</main>
  },
})

export const Route = createFileRoute('/$a/$b/$c')({
  beforeLoad: ({ params, context }) => {
    const parent = context as BeforeLoadContext

    return {
      chainToken: `${parent.chainToken}.${params.c}`,
      ctxC: params.c,
    }
  },
  loader: ({ context }) => ({
    marker: makeBeforeLoadMarker(context as BeforeLoadContext),
  }),
  component: LevelCComponent,
})
