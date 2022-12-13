import React from 'react';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="border-6 shadow-xl rounded-lg bg-[#111111] border-[#111111] md:hidden"
          poster="https://assets.trpc.io/www/v10/preview-dark.png"
        >
          <source
            src="https://assets.trpc.io/www/v10/preview-dark.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="border-[20px] shadow-xl rounded-lg bg-[#111111] border-[#111111] hidden md:block"
          poster="https://assets.trpc.io/www/v10/v10-dark-landscape.png"
        >
          <source
            src="https://assets.trpc.io/www/v10/v10-dark-landscape.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
      </figure>
    </div>
  );
};
