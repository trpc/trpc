import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { otherMarker } from '../../../shared'

const OtherPage = Vue.defineComponent({
  setup() {
    return () => (
      <main>
        <p data-testid="page-state">{otherMarker}</p>
      </main>
    )
  },
})

export const Route = createFileRoute('/other')({
  component: OtherPage,
})
