import { createFileRoute } from '@tanstack/solid-router'
import axios from 'redaxios'
import type { User } from '../utils/users'

const queryURL = 'https://jsonplaceholder.typicode.com'

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        console.info('Fetching users... @', request.url)
        const res = await axios.get<Array<User>>(`${queryURL}/users`)
        const list = res.data.slice(0, 10)
        return Response.json(
          list.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        )
      },
    },
  },
})
