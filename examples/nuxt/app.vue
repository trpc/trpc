<template>
  <h1>Posts</h1>
  <ul>
    <li v-for="post in posts" :key="post.id">
      {{ post.title }}
    </li>
  </ul>
</template>

<script setup lang="ts">
  import { client } from './lib/client'

  const posts = await client.query('post.all')
</script>
