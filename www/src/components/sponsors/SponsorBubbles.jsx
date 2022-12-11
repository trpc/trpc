import { Pack, hierarchy } from '@visx/hierarchy';
import { ParentSize } from '@visx/responsive';
import React from 'react';
import { twMerge } from 'tailwind-merge';
import { sponsors as _sponsors } from './script.output';
import { getMultiplier } from './utils';

const sponsors = _sponsors
  .map((sponsor) => ({
    ...sponsor,
    value: getMultiplier(sponsor.createdAt) * sponsor.monthlyPriceInDollars,
  }))
  .sort((a, b) => a.value - b.value);

const min = Math.min(...sponsors.map((sponsors) => sponsors.value));
const max = Math.max(...sponsors.map((sponsors) => sponsors.value));

const nGroups = 100;

const groupDiff = (max - min) / nGroups;

const groups = [];
for (let index = 0; index < sponsors.length; index++) {
  let pos = 0;
  const sponsor = sponsors[index];
  while (sponsor.value > min + groupDiff * pos) {
    pos++;
  }
  groups[pos] ||= [];
  groups[pos].push({ ...sponsor, value: pos + 1 });
}

console.log('groups', groups);
const pack = {
  children: groups.flat(),
  name: 'root',
  radius: 0,
  distance: 0,
};

export function SponsorBubbles() {
  const root = React.useMemo(
    () =>
      hierarchy(pack)
        .sum((d) => d?.value, 1)
        .sort((a, b) => (b.data.value ?? 0) - (a.data.value ?? 0)),
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
                            `absolute shadow-lg bg-white rounded-full z-0`
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
                            className={`absolute bg-no-repeat bg-center bg-contain rounded-full
                                    w-[95%] h-[95%] dark:w-[100.5%] dark:h-[100.5%]
                                    left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                                    `}
                            style={{
                              backgroundImage: `url(${circle.data.imgSrc})`,
                            }}
                          />
                          <div
                            className={twMerge(
                              `spon-tooltip absolute text-sm
                              bg-gray-800 text-white p-2 pointer-events-none
                              transform opacity-0
                              shadow-xl rounded-lg
                              flex flex-col items-center
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
