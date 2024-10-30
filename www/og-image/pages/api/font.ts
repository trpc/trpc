/**
 * Originally from Vercel's Satori project.
 * @see https://github.com/vercel/satori/blob/main/playground/pages/api/font.ts
 */
import type { NextRequest } from 'next/server';
import { fontParams } from 'utils/zodParams';

export const config = {
  runtime: 'edge',
};

export default async (req: NextRequest) => {
  if (req.nextUrl.pathname !== '/api/font') return;
  const url = new URL(req.url);

  const parsed = fontParams.decodeRequest(req);
  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }
  const props = parsed.data.input;

  let API = `https://fonts.googleapis.com/css2?family=${props.family}:wght@${props.weight}`;
  if (props.text) {
    // allow font optimization if we pass text => only getting the characters we need
    API += `&text=${encodeURIComponent(props.text)}`;
  }

  const css = await (
    await fetch(API, {
      headers: {
        // Make sure it returns TTF.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
    })
  ).text();

  const resource = /src: url\((.+)\) format\('(opentype|truetype)'\)/.exec(css);

  if (!resource?.[1]) return;

  const res = await fetch(resource[1]);

  // Make sure not to mess it around with compression when developing it locally.
  if (url.hostname === 'localhost') {
    res.headers.delete('content-encoding');
    res.headers.delete('content-length');
  }

  return res;
};
