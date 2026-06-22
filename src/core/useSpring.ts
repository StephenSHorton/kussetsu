import { useEffect, useRef, useState } from "react";

// A spring-physics primitive. Animate a number — or a vector / `RGBA` color, each component its
// own spring — toward `target` with a real damped spring (not a keyframed transition):
// INTERRUPTIBLE — change the target mid-flight and it continues from the current value + velocity,
// no snap, with natural overshoot/settle. Each settling frame re-renders React → the reconciler
// commits → the GPU repaints; when the spring comes to rest it stops the loop entirely. This is
// what CSS transitions can't do (they restart from a keyframe and can't carry momentum).
//
//   const x = useSpring(open ? 200 : 0);            // a number
//   const color = useSpring(hover ? hot : cool);    // an RGBA — animate all 4 channels at once

export interface SpringConfig {
  stiffness?: number; // spring constant (higher = snappier)
  damping?: number; // friction (lower = bouncier)
  mass?: number;
}
const DEFAULT: Required<SpringConfig> = { stiffness: 170, damping: 18, mass: 1 };

export function useSpring(target: number, config?: SpringConfig): number;
export function useSpring<T extends readonly number[]>(target: T, config?: SpringConfig): { [K in keyof T]: number };
export function useSpring(target: number | readonly number[], config: SpringConfig = {}): number | number[] {
  const cfg = { ...DEFAULT, ...config };
  const isArr = Array.isArray(target);
  const targets = (isArr ? target : [target]) as readonly number[];
  const n = targets.length;

  const [value, setValue] = useState<number[]>(() => targets.slice());
  const s = useRef({ value: targets.slice(), vel: new Array<number>(n).fill(0), targets: targets.slice(), raf: 0, last: 0 });
  s.current.targets = targets.slice(); // keep the target live without restarting React state
  if (s.current.value.length !== n) { s.current.value = targets.slice(); s.current.vel = new Array<number>(n).fill(0); } // length changed

  const key = targets.join(","); // re-kick the spring when any component of the target changes

  useEffect(() => {
    const st = s.current;
    const step = (now: number) => {
      const dt = Math.min(0.064, st.last ? (now - st.last) / 1000 : 1 / 60);
      st.last = now;
      // semi-implicit Euler on a damped harmonic oscillator, per component
      let atRest = true;
      for (let i = 0; i < n; i++) {
        const force = -cfg.stiffness * (st.value[i] - st.targets[i]) - cfg.damping * st.vel[i];
        st.vel[i] += (force / cfg.mass) * dt;
        st.value[i] += st.vel[i] * dt;
        if (Math.abs(st.value[i] - st.targets[i]) < 0.01 && Math.abs(st.vel[i]) < 0.05) {
          st.value[i] = st.targets[i];
          st.vel[i] = 0;
        } else {
          atRest = false;
        }
      }
      if (atRest) {
        st.raf = 0;
        st.last = 0;
        setValue(st.targets.slice()); // final exact values, then stop
        return;
      }
      setValue(st.value.slice());
      st.raf = requestAnimationFrame(step);
    };
    if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(step); } // (re)kick on target change
    return () => { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; };
  }, [key, n, cfg.stiffness, cfg.damping, cfg.mass]);

  return isArr ? value : value[0];
}
