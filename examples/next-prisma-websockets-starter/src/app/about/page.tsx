import type { Metadata } from 'next';
import { RandomNumbers } from './random-numbers';

export const metadata: Metadata = {
  title: 'Random numbers · tRPC WebSocket Starter',
};

export default function AboutPage() {
  return <RandomNumbers />;
}
