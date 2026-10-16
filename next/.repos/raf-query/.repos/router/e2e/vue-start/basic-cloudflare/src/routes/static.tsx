import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { env } from 'cloudflare:workers'

const StaticPage = defineComponent({
  setup() {
    const data = Route.useLoaderData()
    return () => (
      <div>
        <h1 data-testid="static-heading">Static Page</h1>
        <p data-testid="static-content">The value is {data.value.myVar}</p>
      </div>
    )
  },
})

export const Route = createFileRoute('/static')({
  loader: () => getData(),
  component: StaticPage,
})

const getData = createServerFn().handler(() => {
  return {
    myVar: env.MY_VAR,
  }
})
