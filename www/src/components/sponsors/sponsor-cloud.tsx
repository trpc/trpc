import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@shared/ui/components/tooltip';
import { cn } from '@shared/ui/lib/utils';
import { PartyPopper } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import {
  avatarUrl,
  drawnSponsors,
  recentSponsorsOf,
  sponsorKey,
} from '~/sponsors.ts';

import { cloudPadding, packSponsors } from './pack.ts';

const bubbles = packSponsors(drawnSponsors, cloudPadding);

/**
 * Who the cloud celebrates, as of the build rather than the reader's
 * clock, so the prerendered page hydrates unchanged.
 */
const recent = recentSponsorsOf(drawnSponsors, import.meta.env.BUILT_AT);
const recentKeys = new Set(recent.sponsors.map(sponsorKey));

/** The cloud's widest, in px: `max-w-3xl`. */
const maxWidth = 768;

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
/** How long a bubble takes to pop in, in ms (`duration-500`). */
const popMs = 500;

/** When the celebrated bubbles pop: after the rest have, or soon when they never hid. */
const celebrateDelayMs = (entrance: Entrance) =>
  entrance === 'shown'
    ? Math.min((bubbles.length - 1) * stagger, lastDelay) + popMs
    : 300;

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
 * Every sponsor the site draws as a circle, sized by what they've given.
 * The newest (`recentSponsorsOf`) glow and wear a badge; once the cloud is
 * in view, and motion is welcome, they pop in last with a burst of
 * confetti.
 */
export function SponsorCloud(props: { readonly className?: string }) {
  const [entrance, setEntrance] = useState<Entrance>('none');
  const [celebrating, setCelebrating] = useState(false);
  const celebrateAt = celebrateDelayMs(entrance);
  return (
    <div className={props.className}>
      <div
        className="relative aspect-square w-full"
        data-entrance={entrance}
        ref={(element) => {
          if (
            !element ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
          ) {
            return;
          }
          const observer = new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (entry?.isIntersecting) {
                setEntrance((now) => (now === 'waiting' ? 'shown' : now));
                setCelebrating(true);
                observer.disconnect();
              } else {
                setEntrance((now) => (now === 'none' ? 'waiting' : now));
              }
            },
            { rootMargin: '0px 0px -20% 0px' },
          );
          observer.observe(element);
          return () => observer.disconnect();
        }}
      >
        {bubbles.map((bubble, index) => {
          const celebrated = recentKeys.has(sponsorKey(bubble.sponsor));
          return (
            <span
              className={cn(
                'absolute -translate-1/2 transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] in-data-[entrance=waiting]:scale-50 in-data-[entrance=waiting]:opacity-0 has-[a:hover]:z-10',
                celebrated && 'z-[5]',
                celebrated &&
                  celebrating &&
                  (entrance === 'shown'
                    ? 'animate-sponsor-pop'
                    : 'animate-sponsor-boing'),
              )}
              key={sponsorKey(bubble.sponsor)}
              style={
                {
                  ...(celebrated && celebrating ? delayed(celebrateAt) : {}),
                  height: `${bubble.r * 200}%`,
                  left: `${bubble.x * 100}%`,
                  top: `${bubble.y * 100}%`,
                  transitionDelay: `${Math.min(index * stagger, lastDelay)}ms`,
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
              <Tooltip>
                <TooltipTrigger
                  delay={80}
                  render={
                    <a
                      aria-label={
                        celebrated
                          ? `${bubble.sponsor.name}, ${recent.kind === 'new' ? 'a new' : 'one of the latest'} sponsor`
                          : bubble.sponsor.name
                      }
                      className={cn(
                        'relative block size-full overflow-hidden rounded-full bg-background shadow-md transition-[scale,box-shadow] duration-200 outline-none hover:scale-110 hover:shadow-xl hover:ring-2 hover:ring-brand focus-visible:scale-110 focus-visible:ring-3 focus-visible:ring-ring',
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
                <span aria-hidden className="pointer-events-none">
                  <span
                    className="absolute inset-0 animate-sponsor-ripple rounded-full border-2 border-brand"
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
                          'absolute top-1/2 left-1/2 size-[12%] min-h-1 min-w-1 -translate-1/2 animate-sponsor-confetti',
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
                      'animate-sponsor-badge',
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
