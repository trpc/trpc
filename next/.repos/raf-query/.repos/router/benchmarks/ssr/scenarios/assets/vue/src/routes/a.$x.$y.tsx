import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import '../styles/assets-leaf.css'

const LeafComponent = defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <section class="assets-leaf">
        <p>
          assets-leaf-{params.value.x}-{params.value.y}
        </p>
      </section>
    )
  },
})

export const Route = createFileRoute('/a/$x/$y')({
  head: ({ params }) => ({
    meta: [{ title: `SSR Assets ${params.x} ${params.y}` }],
    links: Array.from({ length: 3 }, (_, index) => ({
      rel: 'preload',
      as: 'image',
      href: `/asset-preload/${params.y}-${index}.png`,
    })),
  }),
  component: LeafComponent,
})
