/**
 * The video editor's GPU renderer (WebGL2): every frame is one shader pass
 * that, for up to two clips at once, applies the clip's effect, colour grade
 * and fit, then blends them through a transition. Same pass for the preview
 * and the export, so what you see is what you download.
 */

export const EFFECTS = [
  { id: 'none', name: 'None' },
  { id: 'cinematic', name: 'Cinematic' },
  { id: 'bw-film', name: 'B&W film' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'vhs', name: 'VHS' },
  { id: 'grain', name: 'Film grain' },
  { id: 'chromatic', name: 'Chromatic' },
  { id: 'glow', name: 'Glow' },
  { id: 'pixelate', name: 'Pixelate' },
  { id: 'mirror', name: 'Mirror' },
  { id: 'duotone', name: 'Duotone' },
  { id: 'neon-edges', name: 'Neon edges' },
  { id: 'dreamy', name: 'Dreamy' },
  { id: 'light-leak', name: 'Light leak' },
  { id: 'sharpen', name: 'Sharpen' },
  { id: 'blur', name: 'Blur' },
  { id: 'shake', name: 'Camera shake' },
  { id: 'zoom-pulse', name: 'Zoom pulse' },
  { id: 'rgb-wave', name: 'RGB wave' },
] as const

export const TRANSITIONS = [
  { id: 'cut', name: 'Cut' },
  { id: 'crossfade', name: 'Cross dissolve' },
  { id: 'dip-black', name: 'Dip to black' },
  { id: 'dip-white', name: 'Dip to white' },
  { id: 'push-left', name: 'Push left' },
  { id: 'push-up', name: 'Push up' },
  { id: 'slide-left', name: 'Slide over' },
  { id: 'wipe', name: 'Wipe' },
  { id: 'circle', name: 'Iris reveal' },
  { id: 'zoom', name: 'Zoom through' },
  { id: 'whip', name: 'Whip pan' },
  { id: 'spin', name: 'Spin' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'blur', name: 'Blur dissolve' },
  { id: 'burn', name: 'Film burn' },
  { id: 'luma', name: 'Luma fade' },
] as const

export type EffectId = (typeof EFFECTS)[number]['id']
export type TransitionId = (typeof TRANSITIONS)[number]['id']

/** Colour grade, in the order the shader reads them. */
export type Grade = {
  exposure: number      // stops, -2..2
  brightness: number    // -1..1
  contrast: number      // -1..1
  saturation: number    // -1..1
  vibrance: number      // -1..1
  temperature: number   // -1..1 (cool..warm)
  tint: number          // -1..1 (green..magenta)
  highlights: number    // -1..1
  shadows: number       // -1..1
  vignette: number      // 0..1
  fade: number          // 0..1 (lifted blacks)
  hue: number           // degrees, -180..180
}

export const NEUTRAL_GRADE: Grade = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0,
  tint: 0, highlights: 0, shadows: 0, vignette: 0, fade: 0, hue: 0,
}

const GRADE_KEYS: Array<keyof Grade> = ['exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'temperature', 'tint', 'highlights', 'shadows', 'vignette', 'fade', 'hue']

/** How a clip sits in the frame: whole with bars, whole over a blurred copy of itself, or filling it. */
export type ClipFit = 'contain' | 'blur' | 'cover'

/** Position, size and orientation of a clip in the frame. */
export type ClipTransform = {
  /** 1 = framed by `fit`; 2 = twice as big. */
  scale: number
  /** Offset as a fraction of the frame. */
  x: number
  y: number
  /** Degrees, clockwise. */
  rotate: number
  flipX: boolean
  flipY: boolean
}

export const IDENTITY_TRANSFORM: ClipTransform = { scale: 1, x: 0, y: 0, rotate: 0, flipX: false, flipY: false }

export type ClipLayer = {
  source: TexImageSource
  width: number
  height: number
  fit: ClipFit
  grade: Grade
  effect: EffectId
  amount: number   // 0..1
  /** Seconds into the clip, for effects that move. */
  time: number
  transform?: ClipTransform
  /** 0..1; below 1 fades towards black (clip fade in and out). */
  opacity?: number
  /** Colour wheels (added after the grade): shadows, midtones, highlights. */
  wheels?: { lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number] } | null
  /** Curves as a 256-entry RGBA table, or null for none. */
  curve?: Uint8Array | null
}

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** Pass 1: one clip, with its fit, effect and colour grade, into its own texture. */
const CLIP_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;

uniform sampler2D uTex;
uniform vec4 uFit;      // scale.xy, offset.xy (uv into the source)
uniform vec4 uCover;    // the same, filling the frame (for the blurred backdrop)
uniform float uGrade[12];
uniform int uFx;
uniform float uAmt;
uniform float uTime;
uniform vec4 uXform;    // scale, rotation (radians), x, y
uniform vec2 uFlip;     // 1 = flipped
uniform int uBlurBg;
uniform float uOpacity;
uniform int uOverlay;   // 1 = an overlay track: outside the clip is see-through
uniform vec3 uLift;     // colour wheels: shadows, midtones, highlights
uniform vec3 uGamma;
uniform vec3 uGain;
uniform int uHasCurve;
uniform sampler2D uCurve;  // 256 x 1: red, green and blue curves

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 hueShift(vec3 c, float degrees) {
  float a = radians(degrees);
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// The clip's pixel at a frame position: fit (cover/contain), black outside it.
vec4 raw(sampler2D tex, vec4 fit, vec2 uv) {
  vec2 s = uv * fit.xy + fit.zw;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  return vec4(texture(tex, s).rgb, 1.0);
}

// A soft blur: 25 taps, weighted toward the centre, spread over radius pixels
// (scaled to the frame, so it looks the same at 1080p and in the preview).
vec3 blur9(sampler2D tex, vec4 fit, vec2 uv, float radius) {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  vec2 px = radius * (uRes.y / 1080.0) * 0.5 / uRes;
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
    float w = exp(-float(x * x + y * y) / 4.5);
    sum += raw(tex, fit, uv + vec2(float(x), float(y)) * px).rgb * w;
    total += w;
  }
  return sum / total;
}

// Effects that move pixels around (they read the source several times).
vec3 spatial(sampler2D tex, vec4 fit, vec2 uv, int fx, float amt, float t) {
  if (fx == 4) { // glitch
    float band = floor(uv.y * 24.0);
    float jitter = step(0.82, hash(vec2(band, floor(t * 12.0)))) * (hash(vec2(band, t)) - 0.5) * 0.12 * amt;
    vec2 u = uv + vec2(jitter, 0.0);
    float split = 0.012 * amt * (0.6 + 0.4 * sin(t * 9.0));
    return vec3(raw(tex, fit, u + vec2(split, 0.0)).r, raw(tex, fit, u).g, raw(tex, fit, u - vec2(split, 0.0)).b);
  }
  if (fx == 5) { // vhs
    vec2 u = uv + vec2((hash(vec2(floor(uv.y * 240.0), floor(t * 30.0))) - 0.5) * 0.004 * amt, 0.0);
    float split = 0.006 * amt;
    return vec3(raw(tex, fit, u + vec2(split, 0.0)).r, raw(tex, fit, u).g, raw(tex, fit, u - vec2(split, 0.0)).b);
  }
  if (fx == 7) { // chromatic aberration, stronger toward the edges
    vec2 d = (uv - 0.5) * 0.02 * amt;
    return vec3(raw(tex, fit, uv + d).r, raw(tex, fit, uv).g, raw(tex, fit, uv - d).b);
  }
  if (fx == 8) { // glow
    vec3 base = raw(tex, fit, uv).rgb;
    vec3 bloom = blur9(tex, fit, uv, 16.0 * amt + 6.0);
    return base + max(bloom - 0.55, 0.0) * 1.8 * amt;
  }
  if (fx == 9) { // pixelate
    float cells = mix(240.0, 28.0, amt);
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
    vec2 u = (floor(uv * cells * aspect) + 0.5) / (cells * aspect);
    return raw(tex, fit, u).rgb;
  }
  if (fx == 10) { // mirror
    vec2 u = uv;
    u.x = u.x < 0.5 ? u.x : 1.0 - u.x;
    return raw(tex, fit, mix(uv, u, amt)).rgb;
  }
  if (fx == 12) { // neon edges
    vec2 px = 1.0 / uRes;
    float l = luma(raw(tex, fit, uv - vec2(px.x, 0.0)).rgb), r = luma(raw(tex, fit, uv + vec2(px.x, 0.0)).rgb);
    float u0 = luma(raw(tex, fit, uv - vec2(0.0, px.y)).rgb), d = luma(raw(tex, fit, uv + vec2(0.0, px.y)).rgb);
    float edge = clamp(length(vec2(r - l, d - u0)) * 6.0, 0.0, 1.0);
    vec3 base = raw(tex, fit, uv).rgb;
    vec3 neon = edge * mix(vec3(0.62, 0.98, 0.69), vec3(1.0, 0.24, 0.96), uv.x);
    return mix(base, base * 0.25 + neon * 1.4, amt);
  }
  if (fx == 13) { // dreamy
    vec3 base = raw(tex, fit, uv).rgb;
    vec3 soft = blur9(tex, fit, uv, 14.0);
    return mix(base, max(base, soft) * 1.05 + 0.04, amt * 0.8);
  }
  if (fx == 15) { // sharpen
    vec3 base = raw(tex, fit, uv).rgb;
    vec3 soft = blur9(tex, fit, uv, 2.5);
    return base + (base - soft) * 1.6 * amt;
  }
  if (fx == 16) { // blur
    return mix(raw(tex, fit, uv).rgb, blur9(tex, fit, uv, 2.0 + 34.0 * amt), clamp(amt * 2.0, 0.0, 1.0));
  }
  if (fx == 17) { // camera shake
    vec2 o = vec2(sin(t * 23.0) + sin(t * 37.0) * 0.5, cos(t * 19.0) + cos(t * 41.0) * 0.5) * 0.008 * amt;
    return raw(tex, fit, (uv - 0.5) * (1.0 - 0.03 * amt) + 0.5 + o).rgb;
  }
  if (fx == 18) { // zoom pulse
    float z = 1.0 - (0.5 + 0.5 * sin(t * 6.283 * 1.0)) * 0.08 * amt;
    return raw(tex, fit, (uv - 0.5) * z + 0.5).rgb;
  }
  if (fx == 19) { // rgb wave
    float w = sin(uv.y * 30.0 + t * 6.0) * 0.006 * amt;
    return vec3(raw(tex, fit, uv + vec2(w, 0.0)).r, raw(tex, fit, uv).g, raw(tex, fit, uv - vec2(w, 0.0)).b);
  }
  return raw(tex, fit, uv).rgb;
}

vec3 grade(vec3 c, float g[12], vec2 uv) {
  c *= exp2(g[0]);
  c += g[1] * 0.5;
  c = (c - 0.5) * (1.0 + g[2]) + 0.5;
  float l = luma(c);
  // Highlights and shadows: gain above the middle, lift below it.
  c += g[7] * 0.35 * smoothstep(0.45, 1.0, l);
  c += g[8] * 0.35 * (1.0 - smoothstep(0.0, 0.55, l));
  l = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, 1.0 + g[3] + g[4] * (1.0 - sat) * 1.5);
  c.r += g[5] * 0.12; c.b -= g[5] * 0.12;
  c.g -= g[6] * 0.1; c.rb += g[6] * 0.05;
  if (abs(g[11]) > 0.01) c = hueShift(c, g[11]);
  c = mix(c, c * 0.88 + 0.12, g[10]);
  float v = distance(uv, vec2(0.5)) * 1.35;
  c *= 1.0 - g[9] * smoothstep(0.35, 1.05, v);
  return c;
}

// Effects that change colour only, after the grade.
vec3 look(vec3 c, vec2 uv, int fx, float amt, float t) {
  if (fx == 1) { // cinematic: teal shadows, orange skin, a touch of contrast, letterbox
    float l = luma(c);
    vec3 teal = vec3(0.0, 0.08, 0.12), orange = vec3(0.12, 0.05, -0.04);
    vec3 graded = c + mix(teal, orange, smoothstep(0.2, 0.8, l)) * amt;
    graded = (graded - 0.5) * (1.0 + 0.15 * amt) + 0.5;
    float bars = step(abs(uv.y - 0.5), 0.5 - 0.06 * amt);
    return graded * bars;
  }
  if (fx == 2) { // black and white film
    float l = luma(c);
    l = (l - 0.5) * 1.25 + 0.5;
    l += (hash(uv * 900.0 + t) - 0.5) * 0.08;
    return mix(c, vec3(l), amt);
  }
  if (fx == 3) { // vintage
    vec3 sepia = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
    vec3 v = mix(c, sepia, 0.7) * 0.9 + 0.08;
    v *= 1.0 - 0.45 * smoothstep(0.4, 1.0, distance(uv, vec2(0.5)) * 1.3);
    v += (hash(uv * 700.0 + t) - 0.5) * 0.06;
    return mix(c, v, amt);
  }
  if (fx == 5) { // vhs: scanlines, noise, washed colour
    float scan = 0.9 + 0.1 * sin(uv.y * uRes.y * 1.4);
    vec3 v = mix(vec3(luma(c)), c, 0.8) * scan + (hash(uv * 500.0 + t * 7.0) - 0.5) * 0.12;
    return mix(c, v, amt);
  }
  if (fx == 6) { // film grain
    return c + (hash(uv * uRes + floor(t * 24.0)) - 0.5) * 0.22 * amt;
  }
  if (fx == 11) { // duotone (Spyda mint and indigo)
    vec3 d = mix(vec3(0.11, 0.07, 0.36), vec3(0.62, 0.98, 0.69), smoothstep(0.05, 0.95, luma(c)));
    return mix(c, d, amt);
  }
  if (fx == 14) { // light leak: a warm drifting glow
    vec2 p = vec2(0.15 + 0.25 * sin(t * 0.6), 0.2 + 0.15 * cos(t * 0.4));
    float leak = smoothstep(0.9, 0.0, distance(uv, p));
    return c + vec3(1.0, 0.45, 0.15) * leak * 0.6 * amt;
  }
  return c;
}

// Colour wheels, then curves.
vec3 colour(vec3 c) {
  c = max(c, vec3(0.0));
  c = c + uLift * (1.0 - c);
  c = c * (1.0 + uGain);
  c = pow(max(c, vec3(0.0)), 1.0 / max(vec3(1.0) + uGamma, vec3(0.05)));
  if (uHasCurve == 1) {
    vec3 k = clamp(c, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
    c = vec3(texture(uCurve, vec2(k.r, 0.5)).r, texture(uCurve, vec2(k.g, 0.5)).g, texture(uCurve, vec2(k.b, 0.5)).b);
  }
  return c;
}

// A heavily blurred, dimmed copy of the clip filling the frame, from the
// texture's small mip levels (cheap and smooth at any size).
vec3 backdrop(vec2 uv) {
  vec2 s = uv * uCover.xy + uCover.zw;
  vec3 sum = vec3(0.0);
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) sum += textureLod(uTex, s + vec2(float(x), float(y)) * 0.03, 6.0).rgb;
  return sum / 9.0 * 0.62;
}

void main() {
  // Undo the clip's own move, rotation, size and flip to find where to read it.
  float aspect = uRes.x / uRes.y;
  vec2 q = vUv - 0.5 - uXform.zw;
  q.x *= aspect;
  float ca = cos(uXform.y), sa = sin(uXform.y);
  q = mat2(ca, -sa, sa, ca) * q;
  q /= max(uXform.x, 0.01);
  q.x /= aspect;
  q += 0.5;
  if (uFlip.x > 0.5) q.x = 1.0 - q.x;
  if (uFlip.y > 0.5) q.y = 1.0 - q.y;
  vec2 s = q * uFit.xy + uFit.zw;
  bool inside = s.x >= 0.0 && s.y >= 0.0 && s.x <= 1.0 && s.y <= 1.0;
  if (uOverlay == 1) {
    if (!inside) { outColor = vec4(0.0); return; }
    vec3 o = look(colour(grade(spatial(uTex, uFit, q, uFx, uAmt, uTime), uGrade, vUv)), vUv, uFx, uAmt, uTime);
    // Soften the edge by a pixel so a scaled-down overlay is not jagged.
    vec2 edge = min(s, 1.0 - s) / max(fwidth(s), vec2(1e-5));
    float a = clamp(min(edge.x, edge.y), 0.0, 1.0) * clamp(uOpacity, 0.0, 1.0);
    outColor = vec4(clamp(o, 0.0, 1.0) * a, a);
    return;
  }
  vec3 c = inside ? spatial(uTex, uFit, q, uFx, uAmt, uTime) : (uBlurBg == 1 ? backdrop(vUv) : vec3(0.0));
  c = look(colour(grade(c, uGrade, vUv)), vUv, uFx, uAmt, uTime);
  outColor = vec4(clamp(c, 0.0, 1.0) * clamp(uOpacity, 0.0, 1.0), 1.0);
}`

/** Pass 3: an overlay track's finished clip, laid over the frame (premultiplied alpha). */
const OVERLAY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uLayer;
// Clip textures are stored upside down (as in the mix pass), so read them flipped.
void main() { outColor = texture(uLayer, vec2(vUv.x, 1.0 - vUv.y)); }`

/**
 * Pass 2: the frame, from one finished clip or two through a transition. Kept
 * apart from pass 1 so a transition samples two textures instead of running
 * every effect again per tap, which keeps the shader small enough for any GPU.
 */
const MIX_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;

uniform sampler2D uA;
uniform sampler2D uB;
uniform int uHasB;
uniform int uTransition;
uniform float uProgress;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 hueShift(vec3 c, float degrees) {
  float a = radians(degrees);
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// Pass 1 drew upright in GL's coordinates; frame positions are top-down.
vec3 clipA(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture(uA, vec2(uv.x, 1.0 - uv.y)).rgb;
}
vec3 clipB(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture(uB, vec2(uv.x, 1.0 - uv.y)).rgb;
}

vec2 rotate(vec2 uv, float a) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  return p / vec2(uRes.x / uRes.y, 1.0) + 0.5;
}

vec3 transition(vec2 uv, float p) {
  float e = p * p * (3.0 - 2.0 * p);
  if (uTransition == 1) return mix(clipA(uv), clipB(uv), e);
  if (uTransition == 2) return p < 0.5 ? clipA(uv) * (1.0 - p * 2.0) : clipB(uv) * ((p - 0.5) * 2.0);
  if (uTransition == 3) return p < 0.5 ? mix(clipA(uv), vec3(1.0), p * 2.0) : mix(vec3(1.0), clipB(uv), (p - 0.5) * 2.0);
  if (uTransition == 4) return uv.x < 1.0 - e ? clipA(uv + vec2(e, 0.0)) : clipB(uv - vec2(1.0 - e, 0.0));
  if (uTransition == 5) return uv.y < 1.0 - e ? clipA(uv + vec2(0.0, e)) : clipB(uv - vec2(0.0, 1.0 - e));
  if (uTransition == 6) return uv.x > 1.0 - e ? clipB(uv - vec2(1.0 - e, 0.0)) : clipA(uv);
  if (uTransition == 7) {
    float edge = smoothstep(e - 0.02, e + 0.02, uv.x);
    return mix(clipB(uv), clipA(uv), edge);
  }
  if (uTransition == 8) {
    vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = e * 1.1;
    return mix(clipB(uv), clipA(uv), smoothstep(r - 0.01, r + 0.01, length(d)));
  }
  if (uTransition == 9) {
    vec3 a = clipA((uv - 0.5) / (1.0 + e * 1.5) + 0.5);
    vec3 b = clipB((uv - 0.5) / (0.4 + 0.6 * e) + 0.5);
    return mix(a, b, smoothstep(0.35, 0.65, p)) + vec3(1.0) * pow(1.0 - abs(p - 0.5) * 2.0, 6.0) * 0.5;
  }
  if (uTransition == 10) { // whip pan: a fast push with motion blur
    vec3 sum = vec3(0.0);
    float blur = sin(p * 3.14159) * 0.08;
    for (int i = 0; i < 8; i++) {
      float o = e + (float(i) / 7.0 - 0.5) * blur;
      vec2 u = uv + vec2(o, 0.0);
      sum += u.x < 1.0 ? clipA(u) : clipB(u - vec2(1.0, 0.0));
    }
    return sum / 8.0;
  }
  if (uTransition == 11) {
    vec3 a = clipA(rotate((uv - 0.5) * (1.0 + e) + 0.5, e * 3.14159));
    vec3 b = clipB(rotate((uv - 0.5) * (2.0 - e) + 0.5, (e - 1.0) * 3.14159));
    return mix(a, b, smoothstep(0.4, 0.6, p));
  }
  if (uTransition == 12) { // glitch
    float strength = sin(p * 3.14159);
    float band = floor(uv.y * 18.0);
    vec2 u = uv + vec2((hash(vec2(band, floor(p * 20.0))) - 0.5) * 0.25 * strength, 0.0);
    vec3 a = vec3(clipA(u + vec2(0.02 * strength, 0.0)).r, clipA(u).g, clipA(u - vec2(0.02 * strength, 0.0)).b);
    vec3 b = vec3(clipB(u + vec2(0.02 * strength, 0.0)).r, clipB(u).g, clipB(u - vec2(0.02 * strength, 0.0)).b);
    return p < 0.5 ? a : b;
  }
  if (uTransition == 13) { // blur dissolve
    float r = sin(p * 3.14159) * 0.012;
    vec3 a = vec3(0.0), b = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float ang = float(i) * 1.0472;
      vec2 o = vec2(cos(ang), sin(ang)) * r;
      a += clipA(uv + o); b += clipB(uv + o);
    }
    return mix(a / 6.0, b / 6.0, e);
  }
  if (uTransition == 14) { // film burn
    float burn = smoothstep(0.0, 0.5, p) * (1.0 - smoothstep(0.5, 1.0, p));
    float n = hash(floor(uv * 40.0) + floor(p * 10.0));
    vec3 light = vec3(1.0, 0.55, 0.2) * burn * (1.2 + n * 0.6) * smoothstep(1.2, 0.0, distance(uv, vec2(0.2 + p * 0.6, 0.5)));
    return mix(clipA(uv), clipB(uv), smoothstep(0.35, 0.65, p)) + light;
  }
  if (uTransition == 15) { // luma fade: brighter parts of the next clip arrive first
    vec3 b = clipB(uv);
    float l = luma(b);
    return mix(clipA(uv), b, smoothstep(l - 0.15, l + 0.15, e * 1.3 - 0.15));
  }
  return p < 0.5 ? clipA(uv) : clipB(uv);
}

void main() {
  vec3 c = uHasB == 1 ? transition(vUv, clamp(uProgress, 0.0, 1.0)) : clipA(vUv);
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader failed to compile.')
  return shader
}

/** Where to sample the source so it covers or fits inside the frame. */
function fitOf(layer: Pick<ClipLayer, 'width' | 'height' | 'fit'>, frameW: number, frameH: number): [number, number, number, number] {
  const sourceAspect = layer.width / Math.max(1, layer.height)
  const frameAspect = frameW / frameH
  let sx = 1, sy = 1
  if (layer.fit === 'cover') {
    if (sourceAspect > frameAspect) sx = frameAspect / sourceAspect
    else sy = sourceAspect / frameAspect
  } else if (sourceAspect > frameAspect) sy = sourceAspect / frameAspect
  else sx = frameAspect / sourceAspect
  return [sx, sy, (1 - sx) / 2, (1 - sy) / 2]
}

export class VideoRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private clipProgram: WebGLProgram
  private mixProgram: WebGLProgram
  private overlayProgram: WebGLProgram
  private source: WebGLTexture
  private curveTexture: WebGLTexture
  /** Finished clips A and B, each with its framebuffer. */
  private layers: Array<{ texture: WebGLTexture; framebuffer: WebGLFramebuffer }>
  private size = { width: 0, height: 0 }
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false })
    if (!gl) throw new Error('This browser cannot run the video editor (WebGL2 is unavailable).')
    this.gl = gl
    this.clipProgram = link(gl, CLIP_FRAGMENT)
    this.mixProgram = link(gl, MIX_FRAGMENT)
    this.overlayProgram = link(gl, OVERLAY_FRAGMENT)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.source = this.makeTexture()
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    this.layers = [0, 1].map(() => ({ texture: this.makeTexture(), framebuffer: gl.createFramebuffer()! }))
    gl.useProgram(this.mixProgram)
    gl.uniform1i(this.u(this.mixProgram, 'uA'), 1)
    gl.uniform1i(this.u(this.mixProgram, 'uB'), 2)
    this.curveTexture = this.makeTexture()
    gl.useProgram(this.clipProgram)
    gl.uniform1i(this.u(this.clipProgram, 'uTex'), 0)
    gl.uniform1i(this.u(this.clipProgram, 'uCurve'), 4)
  }

  private u(program: WebGLProgram, name: string) {
    let map = this.uniforms.get(program)
    if (!map) { map = new Map(); this.uniforms.set(program, map) }
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(program, name))
    return map.get(name)!
  }

  private makeTexture() {
    const gl = this.gl
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    return texture
  }

  /** Clip textures follow the frame size. */
  private fitLayers() {
    const gl = this.gl
    const { width, height } = this.canvas
    if (this.size.width === width && this.size.height === height) return
    this.size = { width, height }
    for (const layer of this.layers) {
      gl.bindTexture(gl.TEXTURE_2D, layer.texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture, 0)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Pass 1 for one clip, into layer `slot`. */
  private renderClip(slot: 0 | 1, layer: ClipLayer, overlay = false) {
    const gl = this.gl
    const program = this.clipProgram
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.source)
      gl.generateMipmap(gl.TEXTURE_2D)
    } catch {
      // A frame not decoded yet keeps the previous one.
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layers[slot].framebuffer)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.u(program, 'uRes'), this.canvas.width, this.canvas.height)
    gl.uniform4fv(this.u(program, 'uFit'), fitOf(layer, this.canvas.width, this.canvas.height))
    gl.uniform4fv(this.u(program, 'uCover'), fitOf({ ...layer, fit: 'cover' }, this.canvas.width, this.canvas.height))
    const move = layer.transform ?? IDENTITY_TRANSFORM
    gl.uniform4f(this.u(program, 'uXform'), move.scale, (move.rotate * Math.PI) / 180, move.x, move.y)
    gl.uniform2f(this.u(program, 'uFlip'), move.flipX ? 1 : 0, move.flipY ? 1 : 0)
    gl.uniform1i(this.u(program, 'uBlurBg'), layer.fit === 'blur' ? 1 : 0)
    gl.uniform1f(this.u(program, 'uOpacity'), layer.opacity ?? 1)
    gl.uniform1i(this.u(program, 'uOverlay'), overlay ? 1 : 0)
    const wheels = layer.wheels
    gl.uniform3fv(this.u(program, 'uLift'), wheels?.lift ?? [0, 0, 0])
    gl.uniform3fv(this.u(program, 'uGamma'), wheels?.gamma ?? [0, 0, 0])
    gl.uniform3fv(this.u(program, 'uGain'), wheels?.gain ?? [0, 0, 0])
    gl.uniform1i(this.u(program, 'uHasCurve'), layer.curve ? 1 : 0)
    if (layer.curve) {
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, this.curveTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.curve)
      gl.activeTexture(gl.TEXTURE0)
    }
    gl.uniform1fv(this.u(program, 'uGrade'), GRADE_KEYS.map(key => layer.grade[key]))
    gl.uniform1i(this.u(program, 'uFx'), Math.max(0, EFFECTS.findIndex(effect => effect.id === layer.effect)))
    gl.uniform1f(this.u(program, 'uAmt'), layer.amount)
    gl.uniform1f(this.u(program, 'uTime'), layer.time)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Draws one frame: clip A alone, or A into B through `transition` at `progress` (0..1). */
  draw(a: ClipLayer | null, b: ClipLayer | null = null, transition: TransitionId = 'crossfade', progress = 0) {
    const gl = this.gl
    if (!a) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    this.fitLayers()
    this.renderClip(0, a)
    if (b) this.renderClip(1, b)
    const program = this.mixProgram
    gl.useProgram(program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.layers[0].texture)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.layers[1].texture)
    gl.uniform2f(this.u(program, 'uRes'), this.canvas.width, this.canvas.height)
    gl.uniform1i(this.u(program, 'uHasB'), b ? 1 : 0)
    gl.uniform1i(this.u(program, 'uTransition'), Math.max(0, TRANSITIONS.findIndex(item => item.id === transition)))
    gl.uniform1f(this.u(program, 'uProgress'), progress)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Lays one overlay-track clip over the frame `draw` just made (call it after `draw`, bottom track first). */
  drawOverlay(layer: ClipLayer) {
    const gl = this.gl
    this.fitLayers()
    this.renderClip(0, layer, true)
    const program = this.overlayProgram
    gl.useProgram(program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.layers[0].texture)
    gl.uniform1i(this.u(program, 'uLayer'), 3)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.BLEND)
  }
}

function link(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(program, 0, 'aPos')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader failed to link.')
  return program
}
