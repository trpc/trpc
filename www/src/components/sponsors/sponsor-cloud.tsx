import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shared/ui/components/tooltip';
import { cn } from '@shared/ui/lib/utils';
import { type CSSProperties, useCallback, useState } from 'react';

import { avatarUrl, drawnSponsors, sponsorKey } from '~/sponsors.ts';

import { animateCloud } from './jelly.ts';
import { cloudHeight, cloudPadding, packSponsors } from './pack.ts';

const bubbles = packSponsors(drawnSponsors, cloudPadding);

const height = cloudHeight(bubbles);

/** The cloud's widest, in px: `max-w-4xl`. */
const maxWidth = 896;

/** GitHub resizes avatars; ask for the smallest of these that's sharp at 2x. */
const avatarSizes = [64, 120, 240, 460] as const;

const avatarSizeFor = (r: number) =>
  avatarSizes.find((size) => size >= r * 2 * maxWidth * 2) ?? 460;

const since = new Intl.DateTimeFormat('en', {
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** How long bubble `index` waits to pop in, in ms: the heaviest first. */
const entranceDelay = (index: number) => Math.min(index * 18, 900);

/**
 * Whether the bubbles wait to pop in: only when JavaScript runs, motion is
 * welcome and the cloud starts out of view, so a reader who can see it
 * never sees it disappear.
 */
type Entrance = 'none' | 'waiting' | 'shown';

/** Every sponsor the site draws as a circle, sized by what they've given, in a heart. */
export function SponsorCloud(props: { readonly className?: string }) {
  const [entrance, setEntrance] = useState<Entrance>('none');
  // Stable, so React sets the cloud up once rather than on every render.
  const alive = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    let stop: (() => void) | undefined;
    const start = () => {
      const cloud = animateCloud(
        element,
        [...element.querySelectorAll<HTMLElement>('[data-bubble]')],
        bubbles,
      );
      let waiting = false;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            if (waiting) {
              cloud.drop(bubbles.map((_, index) => entranceDelay(index)));
            }
            setEntrance((now) => (now === 'waiting' ? 'shown' : now));
            observer.disconnect();
          } else {
            waiting = true;
            setEntrance((now) => (now === 'none' ? 'waiting' : now));
          }
        },
        { rootMargin: '0px 0px -20% 0px' },
      );
      observer.observe(element);
      stop = () => {
        observer.disconnect();
        cloud.stop();
        setEntrance((now) => (now === 'waiting' ? 'none' : now));
        stop = undefined;
      };
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const follow = () => {
      if (motion.matches) {
        stop?.();
      } else if (stop === undefined) {
        start();
      }
    };
    follow();
    motion.addEventListener('change', follow);
    return () => {
      motion.removeEventListener('change', follow);
      stop?.();
    };
  }, []);
  return (
    <div
      className={cn('relative w-full', props.className)}
      data-entrance={entrance}
      ref={alive}
      style={{ aspectRatio: `1 / ${height}` } satisfies CSSProperties}
    >
      {bubbles.map((bubble, index) => (
        <span
          className="absolute aspect-square -translate-1/2 transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] in-data-[entrance=waiting]:scale-50 in-data-[entrance=waiting]:opacity-0 has-[a:hover]:z-10"
          data-bubble=""
          key={sponsorKey(bubble.sponsor)}
          style={
            {
              left: `${bubble.x * 100}%`,
              top: `${(bubble.y / height) * 100}%`,
              transitionDelay: `${entranceDelay(index)}ms`,
              width: `${bubble.r * 200}%`,
            } satisfies CSSProperties
          }
        >
          <Tooltip>
            <TooltipTrigger
              delay={80}
              render={
                <a
                  aria-label={bubble.sponsor.name}
                  className="block size-full overflow-hidden rounded-full bg-background shadow-md ring-1 ring-foreground/10 transition-[scale,box-shadow] duration-200 outline-none hover:scale-110 hover:shadow-xl hover:ring-2 hover:ring-brand focus-visible:scale-110 focus-visible:ring-3 focus-visible:ring-ring"
                  href={bubble.sponsor.link}
                  rel="sponsored noopener"
                  target="_blank"
                />
              }
            >
              <img
                alt=""
                className="size-full object-cover"
                decoding="async"
                height={avatarSizeFor(bubble.r)}
                loading="lazy"
                src={avatarUrl(bubble.sponsor, avatarSizeFor(bubble.r))}
                width={avatarSizeFor(bubble.r)}
              />
            </TooltipTrigger>
            <TooltipContent className="flex-col items-start gap-0">
              <span className="font-semibold">{bubble.sponsor.name}</span>
              <span className="opacity-70">
                Since {since.format(bubble.sponsor.createdAt)}
              </span>
            </TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}
