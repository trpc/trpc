// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-03-13',
  devtools: { enabled: true },
  build: {
    transpile: ['trpc-nuxt'],
  },
});
