import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { env } from 'cloudflare:workers'

const Home = defineComponent({
  setup() {
    const data = Route.useLoaderData()
    return () => (
      <div class="p-2">
        <h3>Welcome Home!!!</h3>
        <p data-testid="message">{data.value.message}</p>
        <p data-testid="myVar">{data.value.myVar}</p>
      </div>
    )
  },
})

export const Route = createFileRoute('/')({
  loader: () => getData(),
  component: Home,
})

const getData = createServerFn().handler(() => {
  return {
    message: `Running in ${navigator.userAgent}`,
    myVar: env.MY_VAR,
  }
})
