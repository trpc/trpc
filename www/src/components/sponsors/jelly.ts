/**
 * The sponsor cloud's bubbles as soft bodies: each hangs on a spring at
 * its place in the heart (`pack.ts`), squishes along the way it moves and
 * wobbles when it stops, bumps the bubbles it touches, and gets pushed
 * about by a pointer moving near it. Positions are offsets from each
 * bubble's place, in CSS pixels; `animateCloud` draws them as transforms.
 */

/** A bubble's place and radius, in CSS pixels from the cloud's top left. */
export interface Home {
  readonly r: number;
  readonly x: number;
  readonly y: number;
}

/** Where a pointer is over the cloud, and how fast it's moving, in px and px/s. */
export interface Pointer {
  readonly vx: number;
  readonly vy: number;
  readonly x: number;
  readonly y: number;
}

/** How hard a bubble springs back to its place, in s⁻², and how much that's damped. */
const stiffness = 90;
const damping = 2 * 0.32 * Math.sqrt(stiffness);

/** How hard two bubbles that touch push apart, per px they overlap. */
const bump = 1400;

/** How far past its edge a pointer reaches a bubble, and how hard it pushes it there. */
const reach = 56;
const push = 900;

/** How much a moving pointer drags the bubbles it passes along with it, in s⁻¹. */
const drag = 1.5;

/** The fastest a pointer counts as moving, so a flick doesn't fling bubbles. */
const fastest = 1200;

/** How fast a pointer's speed fades once it stops moving, in s⁻¹. */
const settle = 10;

/** How far a dropped bubble falls from, in px, least and most. */
const dropHeights = [20, 38] as const;

/** How hard a poke squishes a bubble at most, in stretch per second. */
const hardestPoke = 1.6;

/** How much a bubble stretches per px/s it moves, the most it does, and its wobble's spring. */
const stretch = 1 / 2400;
const mostStretch = 0.16;
const wobbleStiffness = 320;
const wobbleDamping = 2 * 0.2 * Math.sqrt(wobbleStiffness);

/** How much bigger a hovered or focused bubble is drawn: the link's `scale-110`. */
const grownScale = 1.1;

/** Below these, a bubble is still. */
const stillOffset = 0.05;
const stillSpeed = 1;
const stillPull = 20;
const stillWobble = 0.001;

const length = (x: number, y: number) => Math.sqrt(x * x + y * y);

export class Jelly {
  homes: ReadonlyArray<Home>;
  /** The bubbles' offsets from their places, and their velocities. */
  readonly ox: Array<number>;
  readonly oy: Array<number>;
  readonly vx: Array<number>;
  readonly vy: Array<number>;
  /** How each is squished: stretched by `|q|` along `q`, and how that's changing. */
  readonly qx: Array<number>;
  readonly qy: Array<number>;
  readonly qvx: Array<number>;
  readonly qvy: Array<number>;
  /** Seconds until each dropped bubble falls, or `undefined` once it has. */
  readonly held: Array<number | undefined>;
  /** Which are drawn larger: hovered or focused. Neither is pushed by the pointer. */
  readonly grown = new Set<number>();
  pointer: Pointer | undefined;

  constructor(homes: ReadonlyArray<Home>) {
    this.homes = homes;
    const zeros = () => homes.map(() => 0);
    this.ox = zeros();
    this.oy = zeros();
    this.vx = zeros();
    this.vy = zeros();
    this.qx = zeros();
    this.qy = zeros();
    this.qvx = zeros();
    this.qvy = zeros();
    this.held = homes.map(() => undefined);
  }

  /** Lifts every bubble to fall into place, each after its `delays` entry in seconds. */
  drop(delays: ReadonlyArray<number>) {
    const [low, high] = dropHeights;
    for (const [index, delay] of delays.entries()) {
      this.ox[index] = 0;
      this.oy[index] = -(low + (((index * 7) % 5) / 4) * (high - low));
      this.vx[index] = 0;
      this.vy[index] = 0;
      this.held[index] = delay;
    }
  }

  /**
   * Squishes bubble `index` along `(dx, dy)`, as hard as `(dx, dy)` is
   * long, in px/s, as the pointer coming in or a tap does.
   */
  poke(index: number, dx: number, dy: number) {
    const hard = length(dx, dy) * stretch * 8;
    const scale = hard > hardestPoke ? hardestPoke / hard : 1;
    this.qvx[index] = (this.qvx[index] ?? 0) + dx * stretch * 8 * scale;
    this.qvy[index] = (this.qvy[index] ?? 0) + dy * stretch * 8 * scale;
  }

  /** Pushes the bubbles around `(x, y)` out from it, the nearer harder, but for `except`. */
  ripple(x: number, y: number, speed: number, except?: number) {
    for (const [index, home] of this.homes.entries()) {
      if (index === except) {
        continue;
      }
      const dx = home.x + (this.ox[index] ?? 0) - x;
      const dy = home.y + (this.oy[index] ?? 0) - y;
      const d = length(dx, dy);
      const near = 1 - (d - home.r) / (reach * 3);
      if (near <= 0 || d === 0) {
        continue;
      }
      const kick = (speed * Math.min(1, near)) / d;
      this.vx[index] = (this.vx[index] ?? 0) + dx * kick;
      this.vy[index] = (this.vy[index] ?? 0) + dy * kick;
    }
  }

  /** Moves every bubble on by `dt` seconds; whether any is still moving. */
  step(dt: number) {
    const count = this.homes.length;
    const ax = this.homes.map(() => 0);
    const ay = this.homes.map(() => 0);
    const pointer = this.pointer;
    if (pointer !== undefined) {
      const fade = Math.max(0, 1 - settle * dt);
      this.pointer = {
        ...pointer,
        vx: pointer.vx * fade,
        vy: pointer.vy * fade,
      };
    }
    for (let i = 0; i < count; i++) {
      const home = this.homes[i];
      if (home === undefined || this.held[i] !== undefined) {
        continue;
      }
      const ox = this.ox[i] ?? 0;
      const oy = this.oy[i] ?? 0;
      const vx = this.vx[i] ?? 0;
      const vy = this.vy[i] ?? 0;
      ax[i] = (ax[i] ?? 0) - stiffness * ox - damping * vx;
      ay[i] = (ay[i] ?? 0) - stiffness * oy - damping * vy;
      if (pointer !== undefined && !this.grown.has(i)) {
        const dx = home.x + ox - pointer.x;
        const dy = home.y + oy - pointer.y;
        const d = length(dx, dy);
        const near = 1 - (d - home.r) / reach;
        if (d > 0 && near > 0) {
          const strength = Math.min(1, near) ** 2;
          ax[i] = (ax[i] ?? 0) + (push * strength * dx) / d;
          ay[i] = (ay[i] ?? 0) + (push * strength * dy) / d;
          const speed = length(pointer.vx, pointer.vy);
          const cap = speed > fastest ? fastest / speed : 1;
          ax[i] = (ax[i] ?? 0) + drag * strength * (pointer.vx * cap - vx);
          ay[i] = (ay[i] ?? 0) + drag * strength * (pointer.vy * cap - vy);
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const a = this.homes[i];
      if (a === undefined || this.held[i] !== undefined) {
        continue;
      }
      const ra = a.r * (this.grown.has(i) ? grownScale : 1);
      for (let j = i + 1; j < count; j++) {
        const b = this.homes[j];
        if (b === undefined || this.held[j] !== undefined) {
          continue;
        }
        const rb = b.r * (this.grown.has(j) ? grownScale : 1);
        const dx = b.x + (this.ox[j] ?? 0) - a.x - (this.ox[i] ?? 0);
        const dy = b.y + (this.oy[j] ?? 0) - a.y - (this.oy[i] ?? 0);
        const d = length(dx, dy);
        const overlap = ra + rb - d;
        if (overlap <= 0 || d === 0) {
          continue;
        }
        // The lighter gives way more: their masses go as their areas.
        const share = (ra * ra) / (ra * ra + rb * rb);
        const force = (bump * overlap) / d;
        ax[i] = (ax[i] ?? 0) - dx * force * (1 - share);
        ay[i] = (ay[i] ?? 0) - dy * force * (1 - share);
        ax[j] = (ax[j] ?? 0) + dx * force * share;
        ay[j] = (ay[j] ?? 0) + dy * force * share;
      }
    }
    let moving = false;
    for (let i = 0; i < count; i++) {
      const held = this.held[i];
      if (held !== undefined) {
        this.held[i] = held > dt ? held - dt : undefined;
        moving = true;
        continue;
      }
      const vx = (this.vx[i] ?? 0) + (ax[i] ?? 0) * dt;
      const vy = (this.vy[i] ?? 0) + (ay[i] ?? 0) * dt;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.ox[i] = (this.ox[i] ?? 0) + vx * dt;
      this.oy[i] = (this.oy[i] ?? 0) + vy * dt;
      // It stretches along the way it moves, and wobbles about that.
      const speed = length(vx, vy);
      const toward =
        speed * stretch > mostStretch ? mostStretch / (speed * stretch) : 1;
      const tx = vx * stretch * toward;
      const ty = vy * stretch * toward;
      const qx = this.qx[i] ?? 0;
      const qy = this.qy[i] ?? 0;
      const qvx =
        (this.qvx[i] ?? 0) +
        (wobbleStiffness * (tx - qx) - wobbleDamping * (this.qvx[i] ?? 0)) * dt;
      const qvy =
        (this.qvy[i] ?? 0) +
        (wobbleStiffness * (ty - qy) - wobbleDamping * (this.qvy[i] ?? 0)) * dt;
      this.qvx[i] = qvx;
      this.qvy[i] = qvy;
      this.qx[i] = qx + qvx * dt;
      this.qy[i] = qy + qvy * dt;
      moving ||=
        speed > stillSpeed ||
        length(ax[i] ?? 0, ay[i] ?? 0) > stillPull ||
        length(qvx, qvy) > stillWobble * 10 ||
        length(tx - qx, ty - qy) > stillWobble;
    }
    return moving;
  }

  /** Puts every bubble back in its place, at rest: once they've all but settled. */
  rest() {
    for (const values of [
      this.ox,
      this.oy,
      this.vx,
      this.vy,
      this.qx,
      this.qy,
      this.qvx,
      this.qvy,
    ]) {
      values.fill(0);
    }
  }

  /** Whether bubble `index` is in its place, unsquished and at rest. */
  still(index: number) {
    return (
      length(this.ox[index] ?? 0, this.oy[index] ?? 0) < stillOffset &&
      length(this.vx[index] ?? 0, this.vy[index] ?? 0) < stillSpeed &&
      length(this.qx[index] ?? 0, this.qy[index] ?? 0) < stillWobble &&
      length(this.qvx[index] ?? 0, this.qvy[index] ?? 0) < stillWobble * 10
    );
  }

  /** Bubble `index`'s CSS transform: its offset, then its squish, or none when still. */
  transform(index: number) {
    if (this.still(index)) {
      return '';
    }
    const qx = this.qx[index] ?? 0;
    const qy = this.qy[index] ?? 0;
    const amount = Math.min(mostStretch, length(qx, qy));
    const translate = `translate3d(${(this.ox[index] ?? 0).toFixed(2)}px, ${(this.oy[index] ?? 0).toFixed(2)}px, 0)`;
    if (amount < stillWobble) {
      return translate;
    }
    // Stretched by `1 + amount` along `q` and squeezed across it, keeping its area.
    const ux = qx / length(qx, qy);
    const uy = qy / length(qx, qy);
    const along = 1 + amount;
    const across = 1 / along;
    const xx = across + (along - across) * ux * ux;
    const xy = (along - across) * ux * uy;
    const yy = across + (along - across) * uy * uy;
    return `${translate} matrix(${xx.toFixed(4)}, ${xy.toFixed(4)}, ${xy.toFixed(4)}, ${yy.toFixed(4)}, 0, 0)`;
  }
}

/** The longest step `animateCloud` takes, in seconds; a slower frame takes several. */
const longestStep = 1 / 120;

/** The longest frame it catches up on: after a stall, it moves on rather than lurch. */
const longestFrame = 1 / 20;

/** How long a bubble's idle float takes, in ms, before it varies by bubble. */
const floatPeriod = 5200;

export interface Cloud {
  /** Drops the bubbles in, each after its `delays` entry in ms. */
  readonly drop: (delays: ReadonlyArray<number>) => void;
  readonly stop: () => void;
}

/**
 * Brings the cloud in `container` alive: `bubbles` are its bubbles'
 * elements, in the order of `places`, their centers and radii as fractions
 * of its width. Each floats gently on its own, and moves as a `Jelly` when
 * the pointer's near or it's dropped in. It runs a frame only while
 * something moves, and not while the cloud's out of view or the tab's
 * hidden, and writes only transforms, so it never lays the page out again.
 */
export function animateCloud(
  container: HTMLElement,
  bubbles: ReadonlyArray<HTMLElement>,
  places: ReadonlyArray<Home>,
): Cloud {
  let width = container.clientWidth;
  const homesAt = (size: number) =>
    places.map((place) => ({
      r: place.r * size,
      x: place.x * size,
      y: place.y * size,
    }));
  const jelly = new Jelly(homesAt(width));
  let frame: number | undefined;
  let last: number | undefined;
  let visible = true;
  let rect: DOMRect | undefined;
  let lastMove:
    | { readonly t: number; readonly x: number; readonly y: number }
    | undefined;

  const floats = bubbles.map((bubble, index) => {
    const link = bubble.querySelector<HTMLElement>('a');
    if (link === null || typeof link.animate !== 'function') {
      return undefined;
    }
    const lift = Math.max(
      1,
      Math.min(3, (places[index]?.r ?? 0) * width * 0.04),
    );
    const sway = ((index % 3) - 1) * lift * 0.6;
    return link.animate(
      [
        { translate: '0 0' },
        { translate: `${sway}px ${-lift}px` },
        { translate: `${-sway * 0.5}px ${lift * 0.4}px` },
        { translate: '0 0' },
      ],
      {
        delay: -((index * 733) % floatPeriod),
        duration: floatPeriod + ((index * 397) % 2600),
        easing: 'ease-in-out',
        iterations: Number.POSITIVE_INFINITY,
      },
    );
  });

  const draw = () => {
    for (const [index, bubble] of bubbles.entries()) {
      const transform = jelly.transform(index);
      if (bubble.style.transform !== transform) {
        bubble.style.transform = transform;
      }
    }
  };

  const tick = (now: number) => {
    frame = undefined;
    const elapsed = Math.min(longestFrame, (now - (last ?? now) || 16) / 1000);
    last = now;
    const steps = Math.max(1, Math.ceil(elapsed / longestStep));
    let moving = false;
    for (let step = 0; step < steps; step++) {
      moving = jelly.step(elapsed / steps);
    }
    if (!moving && jelly.pointer === undefined) {
      jelly.rest();
    }
    draw();
    if (moving) {
      schedule();
    } else {
      last = undefined;
    }
  };

  const schedule = () => {
    if (frame === undefined && visible && !document.hidden) {
      frame = requestAnimationFrame(tick);
    }
  };

  const pause = () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    last = undefined;
  };

  const toCloud = (event: PointerEvent) => {
    rect ??= container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const bubbleOf = (target: EventTarget | null) => {
    const bubble =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-bubble]')
        : null;
    const index = bubble === null ? -1 : bubbles.indexOf(bubble);
    return index === -1 ? undefined : index;
  };

  let hovered: number | undefined;
  let focused: number | undefined;
  const regrow = () => {
    jelly.grown.clear();
    for (const index of [hovered, focused]) {
      if (index !== undefined) {
        jelly.grown.add(index);
      }
    }
  };

  const onMove = (event: PointerEvent) => {
    const at = toCloud(event);
    const t = event.timeStamp;
    const seconds = lastMove === undefined ? 0 : (t - lastMove.t) / 1000;
    const vx = lastMove && seconds > 0 ? (at.x - lastMove.x) / seconds : 0;
    const vy = lastMove && seconds > 0 ? (at.y - lastMove.y) / seconds : 0;
    lastMove = { t, ...at };
    jelly.pointer = { ...at, vx, vy };
    const over = bubbleOf(event.target);
    if (over !== hovered) {
      if (over !== undefined) {
        jelly.poke(over, vx, vy);
      }
      hovered = over;
      regrow();
    }
    schedule();
  };

  const onLeave = () => {
    jelly.pointer = undefined;
    lastMove = undefined;
    hovered = undefined;
    rect = undefined;
    regrow();
    schedule();
  };

  const onDown = (event: PointerEvent) => {
    const at = toCloud(event);
    const over = bubbleOf(event.target);
    jelly.ripple(at.x, at.y, 160, over);
    if (over !== undefined) {
      jelly.poke(over, 900, 0);
    }
    schedule();
  };

  const onFocus = (event: FocusEvent) => {
    focused = bubbleOf(event.target);
    if (focused !== undefined) {
      jelly.poke(focused, 0, 900);
    }
    regrow();
    schedule();
  };

  const onBlur = () => {
    focused = undefined;
    regrow();
    schedule();
  };

  const forgetRect = () => {
    rect = undefined;
  };

  const onVisibility = () => {
    if (document.hidden) {
      pause();
      for (const float of floats) {
        float?.pause();
      }
    } else if (visible) {
      for (const float of floats) {
        float?.play();
      }
      schedule();
    }
  };

  const resize = new ResizeObserver(([entry]) => {
    const size = entry?.contentRect.width ?? width;
    if (size !== width) {
      width = size;
      jelly.homes = homesAt(size);
      rect = undefined;
    }
  });
  resize.observe(container);

  const view = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    for (const float of floats) {
      if (visible && !document.hidden) {
        float?.play();
      } else {
        float?.pause();
      }
    }
    if (visible) {
      schedule();
    } else {
      pause();
    }
  });
  view.observe(container);

  container.addEventListener('pointermove', onMove, { passive: true });
  container.addEventListener('pointerleave', onLeave, { passive: true });
  container.addEventListener('pointercancel', onLeave, { passive: true });
  container.addEventListener('pointerdown', onDown, { passive: true });
  container.addEventListener('focusin', onFocus);
  container.addEventListener('focusout', onBlur);
  addEventListener('scroll', forgetRect, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return {
    drop: (delays) => {
      jelly.drop(delays.map((delay) => delay / 1000));
      draw();
      schedule();
    },
    stop: () => {
      pause();
      resize.disconnect();
      view.disconnect();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      container.removeEventListener('pointercancel', onLeave);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('focusin', onFocus);
      container.removeEventListener('focusout', onBlur);
      removeEventListener('scroll', forgetRect);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const float of floats) {
        float?.cancel();
      }
      for (const bubble of bubbles) {
        bubble.style.transform = '';
      }
    },
  };
}
