import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import { FiStar } from 'react-icons/fi';
import { Button } from './Button';

type Props = {
  className?: string;
};

function drawStar(
  this: { numPoints: number; w: number },
  ctx: CanvasRenderingContext2D,
) {
  const numPoints = this.numPoints || 5;
  this.numPoints = numPoints;
  const outerRadius = this.w;
  const innerRadius = outerRadius / 2;
  ctx.beginPath();
  ctx.moveTo(0, 0 - outerRadius);

  for (let n = 1; n < numPoints * 2; n++) {
    const radius = n % 2 === 0 ? outerRadius : innerRadius;
    const x = radius * Math.sin((n * Math.PI) / numPoints);
    const y = -1 * radius * Math.cos((n * Math.PI) / numPoints);
    ctx.lineTo(x, y);
  }
  ctx.fill();
  ctx.closePath();
}

export const GithubStarsButton = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState<string>();
  const [showConfetti, setShowConfetti] = useState(false);

  const fetchStars = async () => {
    const res = await fetch('https://api.github.com/repos/tRPC/tRPC');
    const data = (await res.json()) as { stargazers_count: number };
    if (typeof data?.stargazers_count === 'number') {
      setStars(new Intl.NumberFormat().format(data.stargazers_count));
    }
  };

  useEffect(() => {
    if (stars) {
      setStars('22,000');
      const currentNumber = Number(stars.replace(/,/g, ''));
      const nearestThousand =
        Math.floor(Number(stars.replace(/,/g, '')) / 1000) * 1000;
      if (
        currentNumber <= nearestThousand + 50 &&
        currentNumber >= nearestThousand
      ) {
        setShowConfetti(true);
        console.log(ref.current?.getClientRects());
      }
    }
  }, [stars]);

  useEffect(() => {
    fetchStars().catch(console.error);
  }, []);

  return (
    <>
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          drawShape={drawStar}
          recycle={false}
          numberOfPieces={50}
          confettiSource={{
            x: ref.current?.getBoundingClientRect().left || 0,
            y: ref.current?.getBoundingClientRect().top || 0 - 50,
            w: 0,
            h: 0,
          }}
        />
      )}
      <div ref={ref} className="z-[999]">
        <Button
          variant="secondary"
          href="https://github.com/trpc/trpc/stargazers"
          target="_blank"
          className={className + 'z-[999]'}
        >
          <FiStar size={18} strokeWidth={3} />
          <span>Star</span>
          <span
            style={{ transition: 'max-width 1s, opacity 1s' }}
            className={clsx(
              'whitespace-nowrap overflow-hidden w-full',
              stars ? 'opacity-100 max-w-[100px]' : 'opacity-0 max-w-0',
            )}
          >
            {stars}
          </span>
        </Button>
      </div>
    </>
  );
};
