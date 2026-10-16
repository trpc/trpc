import { createFileRoute } from '@tanstack/vue-router'
import { defineComponent } from 'vue'
import PostErrorComponent from '../components/PostErrorComponent.vue'
import { fetchPost } from '../posts'
import type { PostType } from '../posts'

const PostComponent = defineComponent({
  setup() {
    const post = Route.useLoaderData()

    return () => (
      <div class="space-y-2">
        <h4 class="text-xl font-bold underline" data-testid="post-title">
          {(post.value as PostType).title}
        </h4>
        <div class="text-sm">{(post.value as PostType).body}</div>
      </div>
    )
  },
})

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  component: PostComponent,
  errorComponent: PostErrorComponent,
  notFoundComponent: () => <p>Post not found</p>,
})
