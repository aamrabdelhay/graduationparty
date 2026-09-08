"use client";

import { useEffect, useRef } from "react";

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  vr: number;
  shade: number;
  alpha: number;
}

/**
 * Graduation smoke transition: dense theatrical smoke floods the frame,
 * covering the childhood photo, then dissolves revealing the graduate.
 */
export default function SmokeCanvas({
  durationMs,
  onMidpoint,
  onDone,
}: {
  durationMs: number;
  onMidpoint: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const midFired = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const puffs: Puff[] = [];
    const start = performance.now();
    let raf = 0;

    const spawn = (density: number) => {
      const count = Math.round(3 + density * 7);
      for (let i = 0; i < count; i++) {
        const w = canvas.width;
        const h = canvas.height;
        puffs.push({
          x: Math.random() * w,
          y: h * (0.55 + Math.random() * 0.55),
          r: 12 + Math.random() * 30,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -(0.8 + Math.random() * 1.8),
          vr: 1.4 + Math.random() * 2.4,
          shade: 175 + Math.floor(Math.random() * 60),
          alpha: 0.05 + Math.random() * 0.1 * density,
        });
      }
    };

    const frame = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / durationMs);
      // density: sine ramp up in the first half, fade out in the second
      const density = Math.sin(p * Math.PI);
      spawn(Math.max(0.25, density));

      if (p >= 0.5 && !midFired.current) {
        midFired.current = true;
        onMidpoint();
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Flat coverage layer guarantees a complete mask near the peak.
      const coverage = Math.pow(Math.max(0, (density - 0.25) / 0.75), 1.6);
      if (coverage > 0.01) {
        ctx.fillStyle = `rgba(32, 30, 42, ${0.93 * coverage})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      for (let i = puffs.length - 1; i >= 0; i--) {
        const s = puffs[i];
        s.x += s.vx + Math.sin((now + i * 999) / 480) * 0.4;
        s.y += s.vy;
        s.r += s.vr;
        s.alpha *= 0.995;
        if (s.r > canvas.width * 0.9 || s.y + s.r < -60 || s.alpha < 0.004) {
          puffs.splice(i, 1);
          continue;
        }
        const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.12, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(${s.shade}, ${s.shade}, ${s.shade + 12}, ${s.alpha})`);
        g.addColorStop(0.65, `rgba(${s.shade - 25}, ${s.shade - 25}, ${s.shade - 10}, ${s.alpha * 0.55})`);
        g.addColorStop(1, "rgba(20, 19, 28, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p < 1 || puffs.length > 0) {
        if (p >= 1 && puffs.length === 0) return onDone();
        if (p >= 1 && coverage <= 0.01 && puffs.length < 4) return onDone();
        if (p < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          // let remaining puffs settle briefly
          raf = requestAnimationFrame(frame);
          if (p >= 1) {
            onDoneDebounced();
          }
        }
      }
    };

    let doneFired = false;
    const onDoneDebounced = () => {
      if (!doneFired) {
        doneFired = true;
        setTimeout(onDone, 220);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
}
