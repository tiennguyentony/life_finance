"use client";

import { useEffect, useRef, useState } from "react";

export function easeOutQuint(progress: number): number {
  return 1 - Math.pow(1 - progress, 5);
}

/**
 * Animates toward a numeric target with a rAF count-up so money changes read
 * as movement instead of teleportation. Respects prefers-reduced-motion by
 * jumping straight to the target.
 */
export function useAnimatedNumber(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const previousTarget = useRef(target);

  useEffect(() => {
    const from = previousTarget.current;
    previousTarget.current = target;
    if (from === target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reduceMotion ? 0 : durationMs;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress =
        duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      setValue(Math.round(from + (target - from) * easeOutQuint(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
