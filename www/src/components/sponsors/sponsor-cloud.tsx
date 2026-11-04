import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shared/ui/components/tooltip';
import { cn } from '@shared/ui/lib/utils';
import { PartyPopper } from 'lucide-react';
import { type CSSProperties, useCallback, useState } from 'react';

import {
  avatarUrl,
  drawnSponsors,
  recentSponsorsOf,
  sponsorKey,
} from '~/sponsors.ts';

import { animateCloud } from './jelly.ts';
import { cloudHeight, cloudPadding, packSponsors } from './pack.ts';
import { useTapTooltips } from './tap-tooltips.ts';

const bubbles = packSponsors(drawnSponsors, cloudPadding);

const height = cloudHeight(bubbles);

/**
 * Who the cloud celebrates, as of the build rather than the reader's
 * clock, so the prerendered page hydrates unchanged.
 */
const recent = recentSponsorsOf(drawnSponsors, import.meta.env.BUILT_AT);
const recentKeys = new Set(recent.sponsors.map(sponsorKey));

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

const names = new Intl.ListFormat('en').format(
  recent.sponsors.map((sponsor) => sponsor.name),
);

/** How long after the one before each bubble starts to pop in, in ms. */
const stagger = 18;
const lastDelay = 900;
/** How long bubble `index` waits to pop in, in ms: the heaviest first. */
const entranceDelay = (index: number) => Math.min(index * stagger, lastDelay);
/** How long a bubble takes to pop in, in ms (`duration-500`). */
const popMs = 500;

/** When the celebrated bubbles pop: after the rest have, or soon when they never hid. */
const celebrateDelayMs = (entrance: Entrance) =>
  entrance === 'shown' ? entranceDelay(bubbles.length - 1) + popMs : 300;

/** How long after a celebrated bubble starts to pop each flourish starts, in ms. */
const confettiAfter = 300;
const rippleAfter = 350;
const badgeAfter = 500;

const delayed = (ms: number) => ({ animationDelay: `${ms}ms` });

const confettiColors = [
  'bg-brand',
  'bg-amber-400',
  'bg-pink-500',
  'bg-emerald-400',
  'bg-sky-400',
] as const;
const confettiCount = 10;

/**
 * Whether the bubbles wait to pop in: only when JavaScript runs, motion is
 * welcome and the cloud starts out of view, so a reader who can see it
 * never sees it disappear.
 */
type Entrance = 'none' | 'waiting' | 'shown';

/**
 * Every sponsor the site draws as a circle, sized by what they've given, in
 * a heart. The newest (`recentSponsorsOf`) glow and wear a badge; once the cloud is
 * in view, and motion is welcome, they pop in last with a burst of
 * confetti.
 */
export function SponsorCloud(props: { readonly className?: string }) {
  const [entrance, setEntrance] = useState<Entrance>('none');
  const [celebrating, setCelebrating] = useState(false);
  const celebrateAt = celebrateDelayMs(entrance);
  const tap = useTapTooltips();
  // Stable, so React sets the cloud up once rather than on every render.
  const alive = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    let stop: (() => void) | undefined;
    let shown = false;
    const start = () => {
      const cloud = animateCloud(
        element,
        [...element.querySelectorAll<HTMLElement>('[data-bubble]')],
        bubbles,
      );
      let waiting = false;
      const show = () => {
        if (waiting && !shown) {
          // The celebrated bubbles drop in as they pop, after the rest.
          cloud.drop(
            bubbles.map((bubble, index) =>
              recentKeys.has(sponsorKey(bubble.sponsor))
                ? celebrateDelayMs('shown')
                : entranceDelay(index),
            ),
          );
        }
        shown = true;
        setEntrance((now) => (now === 'waiting' ? 'shown' : now));
        setCelebrating(true);
        observer.disconnect();
        element.removeEventListener('focusin', show);
      };
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            show();
          } else {
            waiting = true;
            setEntrance((now) => (now === 'none' ? 'waiting' : now));
          }
        },
        { rootMargin: '0px 0px -20% 0px' },
      );
      observer.observe(element);
      // Keyboard focus mustn't land on a bubble that hasn't shown yet.
      element.addEventListener('focusin', show);
      stop = () => {
        observer.disconnect();
        element.removeEventListener('focusin', show);
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
    <div className={props.className}>
      <div
        className="relative w-full"
        data-entrance={entrance}
        ref={alive}
        style={{ aspectRatio: `1 / ${height}` } satisfies CSSProperties}
      >
        {bubbles.map((bubble, index) => {
          const celebrated = recentKeys.has(sponsorKey(bubble.sponsor));
          return (
            <span
              className={cn(
                'absolute aspect-square -translate-1/2 transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none in-data-[entrance=waiting]:scale-50 in-data-[entrance=waiting]:opacity-0 has-[a:hover]:z-10 has-[a[data-popup-open]]:z-10',
                celebrated && 'z-[5]',
                celebrated &&
                  celebrating &&
                  (entrance === 'shown'
                    ? 'motion-safe:animate-sponsor-pop'
                    : 'motion-safe:animate-sponsor-boing'),
              )}
              data-bubble=""
              key={sponsorKey(bubble.sponsor)}
              style={
                {
                  ...(celebrated && celebrating ? delayed(celebrateAt) : {}),
                  left: `${bubble.x * 100}%`,
                  top: `${(bubble.y / height) * 100}%`,
                  transitionDelay: `${entranceDelay(index)}ms`,
                  width: `${bubble.r * 200}%`,
                } satisfies CSSProperties
              }
            >
              {celebrated ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-[8%] rounded-full bg-brand/40 blur-md motion-safe:animate-sponsor-glow"
                />
              ) : null}
              <Tooltip {...tap(sponsorKey(bubble.sponsor)).root}>
                <TooltipTrigger
                  delay={80}
                  render={
                    <a
                      {...tap(sponsorKey(bubble.sponsor)).trigger}
                      aria-label={
                        celebrated
                          ? `${bubble.sponsor.name}, ${recent.kind === 'new' ? 'a new' : 'one of the latest'} sponsor`
                          : bubble.sponsor.name
                      }
                      className={cn(
                        'relative block size-full overflow-hidden rounded-full bg-background shadow-md transition-[scale,box-shadow] duration-200 outline-none [-webkit-touch-callout:none] hover:scale-110 hover:shadow-xl hover:ring-2 hover:ring-brand focus-visible:scale-110 focus-visible:ring-3 focus-visible:ring-ring data-popup-open:scale-110 data-popup-open:shadow-xl data-popup-open:ring-2 data-popup-open:ring-brand',
                        celebrated
                          ? 'ring-2 ring-brand'
                          : 'ring-1 ring-foreground/10',
                      )}
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
                    {celebrated
                      ? recent.kind === 'new'
                        ? ' · New!'
                        : ' · Latest'
                      : null}
                  </span>
                </TooltipContent>
              </Tooltip>
              {celebrated && celebrating ? (
                <span
                  aria-hidden
                  className="pointer-events-none motion-reduce:hidden"
                >
                  <span
                    className="absolute inset-0 rounded-full border-2 border-brand opacity-0 motion-safe:animate-sponsor-ripple"
                    style={delayed(celebrateAt + rippleAfter)}
                  />
                  {Array.from({ length: confettiCount }, (_, piece) => (
                    <span
                      className="absolute inset-0"
                      key={piece}
                      style={{ rotate: `${(piece * 360) / confettiCount}deg` }}
                    >
                      <span
                        className={cn(
                          'absolute top-1/2 left-1/2 size-[15%] min-h-1.5 min-w-1.5 -translate-1/2 motion-safe:animate-sponsor-confetti',
                          piece % 2 === 0 ? 'rounded-full' : 'rounded-[1px]',
                          confettiColors[piece % confettiColors.length],
                        )}
                        style={delayed(celebrateAt + confettiAfter)}
                      />
                    </span>
                  ))}
                </span>
              ) : null}
              {celebrated ? (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 -rotate-12 rounded-full bg-brand px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide text-white uppercase shadow-md',
                    celebrating &&
                      entrance === 'shown' &&
                      'motion-safe:animate-sponsor-badge',
                  )}
                  style={
                    celebrating && entrance === 'shown'
                      ? delayed(celebrateAt + badgeAfter)
                      : undefined
                  }
                >
                  {recent.kind === 'new' ? 'New' : 'Latest'}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {recent.sponsors.length > 0 ? (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <PartyPopper aria-hidden className="size-4 shrink-0 text-brand" />
          <span>
            {recent.kind === 'new' ? (
              <>
                Welcome to our newest{' '}
                {recent.sponsors.length === 1 ? 'sponsor' : 'sponsors'},{' '}
                <span className="font-medium text-foreground">{names}</span>!
              </>
            ) : (
              <>
                Our latest sponsors:{' '}
                <span className="font-medium text-foreground">{names}</span>.
                Thank you!
              </>
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}
