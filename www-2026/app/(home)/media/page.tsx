import type { Metadata } from 'next';
import { MediaContent } from './media-content';

export const metadata: Metadata = {
  title: 'Media',
  description: 'tRPC media assets and brand guidelines',
};

export default function MediaPage() {
  return <MediaContent />;
}
