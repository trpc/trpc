import { defineComponent } from 'vue'
import { Link, Outlet, createFileRoute } from '@tanstack/vue-router'

import { fetchPosts } from '~/utils/posts'

const PostsComponent = defineComponent({
  setup() {
    const posts = Route.useLoaderData()
    return () => (
      <div class="p-2 flex gap-2">
        <ul class="list-disc pl-4">
          {posts.value.map((post) => (
            <li class="whitespace-nowrap" key={post.id}>
              <Link
                to="/posts/$postId"
                params={{
                  postId: post.id,
                }}
                class="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{ class: 'text-black font-bold' }}
              >
                <div>{post.title.substring(0, 20)}</div>
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <Outlet />
      </div>
    )
  },
})

export const Route = createFileRoute('/posts')({
  head: () => ({
    meta: [
      {
        title: 'Posts page',
      },
    ],
  }),
  loader: async () => fetchPosts(),
  component: PostsComponent,
})
