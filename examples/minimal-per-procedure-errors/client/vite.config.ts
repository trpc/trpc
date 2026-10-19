import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3001,
  },
  preview: {
    port: 3001,
  },
  plugins: [react()],
});
