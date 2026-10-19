import React from 'react';
import { handleSmoothScrollToSection } from '../utils/handleSmoothScrollToSection';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12 lg:pt-16">
      <figure>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="rounded-lg border-4 border-neutral-900 bg-neutral-900 shadow-xl md:hidden"
          poster="https://assets.trpc.io/www/v10/preview-dark.png"
        >
          <source
            src="https://assets.trpc.io/www/v10/preview-dark.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
        <a
          href="#try-it-out"
          className="hidden rounded-lg border-[20px] border-neutral-900 bg-neutral-900 shadow-[0px_-24px_300px_0px_rgba(57,140,203,0.15)] transition hover:shadow-[0px_-24px_150px_0px_rgba(57,140,203,0.3)] md:block"
          title="Click to try it out"
          onClick={handleSmoothScrollToSection}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            width="1200px"
            poster="https://assets.trpc.io/www/v10/v10-dark-landscape.png"
          >
            <source
              src="https://assets.trpc.io/www/v10/v10-dark-landscape.mp4"
              type="video/mp4"
            />
            You need a browser that supports HTML5 video to view this video.
          </video>
        </a>
      </figure>
    </div>
  );
};
