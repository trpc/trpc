import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'experimental-edge',
};

const font = fetch(new URL('../../../public/inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

export default async function handler() {
  const fontData = await font;

  return new ImageResponse(
    (
      <div
        style={{
          backgroundColor: 'white',
          height: '100%',
          width: '100%',
          fontSize: 100,
          fontFamily: 'inter',
          paddingTop: '100px',
          paddingLeft: '50px',
        }}
      >
        Hello world!
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontData,
          style: 'normal',
        },
      ],
    },
  );
}
