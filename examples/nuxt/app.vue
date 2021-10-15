<template>
  <div>
    {{ data }}
  </div>
</template>

<script setup>
const data = await $fetch('/api/hello')
</script>