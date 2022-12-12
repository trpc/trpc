import { readFileSync } from 'fs';
import path from 'path';
import satori from 'satori';
import svg2img from 'svg2img';

function svgToPng(svgString: string): Promise<Buffer> {
  return new Promise<Buffer>((res, rej) => {
    svg2img(
      `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`,
      {},
      (error, buffer: Buffer) => {
        if (error) {
          rej(error);
        }
        res(buffer);
      },
    );
  });
}

const background = readFileSync(
  path.join(process.cwd(), 'static/og-assets', 'bg.png'),
);

const base64Background = `data:image/png;base64, ${background.toString(
  'base64',
)}`;
const fontSize = 108;
const dimensions = {
  width: 1280,
  height: 640,
};

const font = readFileSync(
  path.join(process.cwd(), 'static/og-assets', 'font.ttf'),
);

export async function generateOgImage(title: string): Promise<Buffer> {
  try {
    console.log('Satori rendering with title: ' + title);
    const svgString = await satori(
      {
        type: 'div',
        props: {
          children: [
            {
              type: 'img',
              props: {
                src: base64Background,
                width: dimensions.width,
                height: dimensions.height,
                style: {
                  width: dimensions.width,
                  height: dimensions.height,
                  display: 'flex',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  objectFit: 'cover',
                  objectPosition: 'top',
                },
              },
            },
            {
              type: 'div',
              props: {
                children: {
                  type: 'div',
                  props: {
                    children: title,
                    style: {
                      fontSize,
                      maxWidth: '85%',
                      textAlign: 'center',
                    },
                  },
                },
                style: {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              },
            },
          ],
          style: {
            backgroundColor: 'red',
            display: 'flex',
            position: 'relative',
            ...dimensions,
          },
        },
      } as any,
      {
        fonts: [
          {
            name: 'Roboto',
            // Use `fs` (Node.js only) or `fetch` to read the font as Buffer/ArrayBuffer and provide `data` here.
            data: font,
            weight: 400,
            style: 'normal',
          },
        ],
        ...dimensions,
      },
    );
    console.log('Satori successfully rendered ' + title);
    // response.setHeader('Cache-Control', 'max-age=0, s-maxage=86400');
    return await svgToPng(svgString);
  } catch (e) {
    console.log('Error generating OG image');
    console.log(e);
    throw new Error('Error generating OG Image');
  }
}
