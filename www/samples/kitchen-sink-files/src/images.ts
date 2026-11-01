import { useEffect, useState } from 'react';

/** A URL an `<img>` can show `blob` at, for as long as it's on screen. */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function png(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob((blob) =>
      blob
        ? resolve(new File([blob], name, { type: 'image/png' }))
        : reject(new Error("The browser couldn't draw the image")),
    ),
  );
}

/** A small PNG drawn in the browser: a letter on a random colour. */
export function drawAvatar(letter: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const draw = canvas.getContext('2d');
  if (draw) {
    draw.fillStyle = `hsl(${String(Math.floor(Math.random() * 360))} 70% 45%)`;
    draw.fillRect(0, 0, 128, 128);
    draw.fillStyle = '#fff';
    draw.font = '600 64px sans-serif';
    draw.textAlign = 'center';
    draw.textBaseline = 'middle';
    draw.fillText(letter.toUpperCase(), 64, 70);
  }
  return png(canvas, 'avatar.png');
}

/** Noise, which PNG can't compress: about 1 MB, over the server's limit. */
export function drawNoise() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const draw = canvas.getContext('2d');
  if (draw) {
    const pixels = draw.createImageData(512, 512);
    // `getRandomValues` fills at most 64 kB at a time.
    for (let i = 0; i < pixels.data.length; i += 65_536) {
      crypto.getRandomValues(pixels.data.subarray(i, i + 65_536));
    }
    for (let i = 3; i < pixels.data.length; i += 4) {
      pixels.data[i] = 255;
    }
    draw.putImageData(pixels, 0, 0);
  }
  return png(canvas, 'noise.png');
}
