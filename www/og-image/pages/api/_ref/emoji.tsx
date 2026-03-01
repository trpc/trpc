import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 100,
          color: 'black',
          background: 'white',
          width: '100%',
          height: '100%',
          padding: '50px 200px',
          textAlign: 'center',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
        }}
      >
        👋, 🌎
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Supported options: 'twemoji', 'blobmoji', 'noto', 'openmoji', 'fluent', 'fluentFlat'
      // Default to 'twemoji'
      emoji: 'twemoji',
    },
  );
}
