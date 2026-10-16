import { HttpResponse, http } from 'msw'
import { posts } from './posts.ts'
import { users } from './users.ts'

export const apiHandlers = [
  ...Object.entries({ posts, users }).flatMap(([resource, data]) => [
    http.get(`https://jsonplaceholder.typicode.com/${resource}`, () =>
      HttpResponse.json(data),
    ),
    http.get(
      `https://jsonplaceholder.typicode.com/${resource}/:id`,
      ({ params }) => {
        const id = parseInt(String(params.id))
        if (Number.isNaN(id)) {
          return HttpResponse.json(
            { error: `invalid ${resource.slice(0, -1)} id` },
            { status: 404 },
          )
        }
        const item = data.find((entry) => entry.id === id)
        return item
          ? HttpResponse.json(item)
          : new HttpResponse(null, {
              headers: { 'content-type': 'application/json' },
            })
      },
    ),
  ]),
  http.all('https://jsonplaceholder.typicode.com/*', () =>
    HttpResponse.error(),
  ),
]
