import { Pack, hierarchy } from '@visx/hierarchy';
import { ParentSize } from '@visx/responsive';
import React from 'react';
import { twMerge } from 'tailwind-merge';
import { allSponsors } from './script.output';

const pack = {
  children: allSponsors,
  name: 'root',
  radius: 0,
  distance: 0,
};

export function SponsorBubbles() {
  const root = React.useMemo(
    () =>
      hierarchy(pack)
        .sum((d) => d?.weight, 1)
        .sort((a, b) => (b.data.weight ?? 0) - (a.data.weight ?? 0)),
    [],
  );

  return (
    <ParentSize>
      {({ width = 800 }) => {
        return width < 10 ? null : (
          <div
            style={{
              width,
              height: width,
              position: 'relative',
            }}
          >
            <style
              dangerouslySetInnerHTML={{
                __html: `
              .spon-link {
                transition: all .2s ease;
                transform: translate(-50%, -50%);
              }
              .spon-link:hover {
                z-index: 10;
                transform: translate(-50%, -50%) scale(1.1);
              }
              .spon-link:hover .spon-tooltip {
                opacity: 1;
              }
            `,
              }}
            />
            <Pack root={root} size={[width, width]} padding={width * 0.005}>
              {(packData) => {
                const circles = packData.descendants().slice(1); // skip first layer
                return (
                  <div>
                    {[...circles].reverse().map((circle, i) => {
                      const tooltipX = circle.x > width / 2 ? 'left' : 'right';
                      const tooltipY = circle.y > width / 2 ? 'top' : 'bottom';

                      return (
                        <a
                          key={`circle-${i}`}
                          href={circle.data.link}
                          className={
                            `spon-link ` +
                            `absolute z-0 rounded-full bg-white shadow-lg`
                          }
                          style={{
                            left: circle.x,
                            top: circle.y,
                            width: circle.r * 2,
                            height: circle.r * 2,
                          }}
                        >
                          <div
                            key={`circle-${i}`}
                            className={`absolute left-1/2 top-1/2 h-[95%] w-[95%]
                                    -translate-x-1/2 -translate-y-1/2 rounded-full bg-contain
                                    bg-center bg-no-repeat dark:h-[100.5%] dark:w-[100.5%]
                                    `}
                            style={{
                              backgroundImage: `url(${circle.data.imgSrc})`,
                            }}
                          />
                          <div
                            className={twMerge(
                              `spon-tooltip pointer-events-none absolute
                              flex transform flex-col items-center
                              rounded-lg bg-gray-800
                              p-2 text-sm
                              text-white opacity-0 shadow-xl
                            `,

                              tooltipX == 'left'
                                ? `left-1/4 -translate-x-full`
                                : `right-1/4 translate-x-full`,
                              tooltipY == 'top'
                                ? `top-1/4 -translate-y-full`
                                : `bottom-1/4 translate-y-full`,
                            )}
                          >
                            <p className={`whitespace-nowrap font-bold`}>
                              {circle.data.name}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                );
              }}
            </Pack>
          </div>
        );
      }}
    </ParentSize>
  );
}
