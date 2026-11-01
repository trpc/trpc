import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    // `@shared/ui` ships source and has its own React install
    dedupe: ['react', 'react-dom'],
  },
});
