<template>
  <div>
    {{ data }}
  </div>
  <article>
    <h2>{{ firstPost.title }}</h2>
    {{ firstPost.text }}
  </article>

</template>

<script setup lang="ts">
import { client } from './lib/client'

const data = await $fetch('/api/hello')
const firstPost = await client.query('post.byId', { id: 1 })
</script>
