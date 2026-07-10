<script setup lang="ts">
const { $trpc } = useNuxtApp();
// 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
const { data } = $trpc.greeting.useQuery({ name: 'tRPC user' });
</script>

<template>
  <div class="container">
    <h1>{{ data?.text }}</h1>
  </div>
</template>

<style scoped>
.container {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
