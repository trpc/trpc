<template>
  <div class="vue-styled-box" data-testid="styled-box">
    This box is styled by a Vue SFC style block.
  </div>
</template>

<style scoped>
.vue-styled-box {
  --vue-sfc-style-marker: present;
  background-color: #7e22ce;
  color: white;
  padding: 24px;
}
</style>
