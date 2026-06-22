// CPU-simulated particle system, rendered as instanced additive quads (one draw call for
// the whole field — same trick as the 10k-node graph). The 10k stress demo proved instanced
// rects scale; particles just make the buffer dynamic (re-uploaded each frame) and add a
// tiny physics step. Pointer-reactive. Soft radial sprites + additive blend = glow (which
// the bloom post-process then blooms). State persists per emitter node across frames.
import type { RGBA } from "./scene";

export interface ParticleSpec {
  count?: number; // default 600
  color?: RGBA; // default warm
  color2?: RGBA; // particles pick randomly between color and color2
  gravity?: number; // px/s² (default 0 — a drifting field)
  speed?: number; // initial speed px/s (default 40)
  size?: number; // sprite diameter px (default 10)
  pointer?: number; // cursor repel strength (default 900); a moving cursor also flings particles
  pointerRadius?: number; // cursor influence radius, px (default 340)
  drag?: number; // velocity damping per second (default 0.6)
  life?: number; // seconds (default 3)
}

const FLOATS = 8; // [x,y,size,_][r,g,b,a]
const WARM: RGBA = [1.0, 0.7, 0.3, 1];

export class ParticleSystem {
  readonly count: number;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array; // seconds lived
  private ttl: Float32Array; // total life
  private cr: Float32Array;
  private cg: Float32Array;
  private cb: Float32Array;
  readonly inst: Float32Array; // instance buffer, FLOATS per particle
  private spawned = false;

  constructor(spec: ParticleSpec) {
    const n = (this.count = Math.max(1, Math.min(40000, spec.count ?? 600)));
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.ttl = new Float32Array(n);
    this.cr = new Float32Array(n);
    this.cg = new Float32Array(n);
    this.cb = new Float32Array(n);
    this.inst = new Float32Array(n * FLOATS);
  }

  private spawn(i: number, rect: [number, number, number, number], spec: ParticleSpec) {
    const [rx, ry, rw, rh] = rect;
    this.x[i] = rx + Math.random() * rw;
    this.y[i] = ry + Math.random() * rh;
    const speed = spec.speed ?? 40;
    const a = Math.random() * Math.PI * 2;
    this.vx[i] = Math.cos(a) * speed * (0.3 + Math.random());
    this.vy[i] = Math.sin(a) * speed * (0.3 + Math.random());
    this.age[i] = 0;
    this.ttl[i] = (spec.life ?? 3) * (0.5 + Math.random());
    const c = Math.random() < 0.5 || !spec.color2 ? spec.color ?? WARM : spec.color2;
    // slight per-particle brightness variation
    const v = 0.7 + Math.random() * 0.5;
    this.cr[i] = c[0] * v;
    this.cg[i] = c[1] * v;
    this.cb[i] = c[2] * v;
  }

  /** Advance the simulation by dt and rebuild the instance buffer. The sim runs in WORLD
   *  space (rect + pointer are world coords); `cam` maps each output position to screen px,
   *  so the field scrolls/zooms with the page (the painter's particle vpBuffer is identity). */
  update(dt: number, rect: [number, number, number, number], pointer: [number, number] | null, pointerVel: [number, number], spec: ParticleSpec, cam: { tx: number; ty: number; scale: number }): void {
    const g = spec.gravity ?? 0;
    const drag = spec.drag ?? 0.6;
    const pf = spec.pointer ?? 900;
    const size = spec.size ?? 10;
    const R = spec.pointerRadius ?? 340;
    const R2 = R * R;
    const pvx = pointerVel[0];
    const pvy = pointerVel[1];
    const damp = Math.max(0, 1 - drag * dt);
    const [rx, ry, rw, rh] = rect;
    for (let i = 0; i < this.count; i++) {
      if (!this.spawned || this.age[i] >= this.ttl[i]) this.spawn(i, rect, spec);
      this.age[i] += dt;
      if (pf !== 0 && pointer) {
        const dx = this.x[i] - pointer[0];
        const dy = this.y[i] - pointer[1];
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const fall = 1 - d / R; // 1 at the cursor, fading to 0 at the radius edge
          const f = pf * fall * dt; // repel: push away from the cursor (graded across the radius)
          this.vx[i] += (dx / d) * f;
          this.vy[i] += (dy / d) * f;
          // fling: a moving cursor drags nearby particles along its direction of travel, so
          // sweeping stirs the field instead of only carving a static void.
          this.vx[i] += pvx * fall * 4.0 * dt;
          this.vy[i] += pvy * fall * 4.0 * dt;
        }
      }
      this.vy[i] += g * dt;
      this.vx[i] *= damp;
      this.vy[i] *= damp;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      // keep the field inside its box (wrap) so it stays a contained section
      if (this.x[i] < rx) this.x[i] += rw; else if (this.x[i] > rx + rw) this.x[i] -= rw;
      if (this.y[i] < ry) this.y[i] += rh; else if (this.y[i] > ry + rh) this.y[i] -= rh;

      const t = this.age[i] / this.ttl[i];
      const alpha = Math.sin(Math.min(1, t) * Math.PI); // fade in + out
      const o = i * FLOATS;
      this.inst[o] = this.x[i] * cam.scale + cam.tx; // world -> screen px
      this.inst[o + 1] = this.y[i] * cam.scale + cam.ty;
      this.inst[o + 2] = size * cam.scale;
      this.inst[o + 3] = 0;
      this.inst[o + 4] = this.cr[i];
      this.inst[o + 5] = this.cg[i];
      this.inst[o + 6] = this.cb[i];
      this.inst[o + 7] = alpha;
    }
    this.spawned = true;
  }
}
