import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';
import { makeClient } from '../trpc.ts';
import { App, TrpcPlugin } from './App.ts';
import '../styles.css';

createApp(App)
  .use(VueQueryPlugin)
  .use(TrpcPlugin, { client: makeClient() })
  .mount('#app');
