/**
 * The landing page's motion piece, drawn as a pure function of time: an
 * eight-second loop in which a sparkle becomes a line of light, the line types
 * "Make it yours", collapses into a glowing pill, and the pill opens into the
 * Spyda AI composer typing a prompt.
 */

export const REEL_DURATION = 8
const MINT = '#9dfab0'
const SKY = '#8bd3ff'
const TEAL = '#12866f'
const PEACH = '#ffab84'
const HEADLINE = 'Make it yours'
const PROMPT = 'Animate my flyer for the launch'

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const span = (t: number, start: number, end: number) => clamp((t - start) / (end - start))
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** A four-point sparkle, the mark the whole piece grows from. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, fill: string | null, stroke: string | null) {
  if (size <= 0.3) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  // Four points joined by inward curves: start at the right point, go round.
  ctx.beginPath()
  const inner = size * 0.18
  ctx.moveTo(size, 0)
  for (let i = 1; i <= 4; i += 1) {
    const angle = (i * Math.PI) / 2
    const middle = angle - Math.PI / 4
    ctx.quadraticCurveTo(Math.cos(middle) * inner, Math.sin(middle) * inner, Math.cos(angle) * size, Math.sin(angle) * size)
  }
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.shadowColor = fill
    ctx.shadowBlur = size * 1.2
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(1, size * 0.08)
    ctx.stroke()
  }
  ctx.restore()
}

function ambient(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string, alpha: number) {
  if (alpha <= 0) return
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, colour)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = alpha
  ctx.fillStyle = gradient
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  ctx.globalAlpha = 1
}

/** A gradient that travels around the border over time. */
function travellingGradient(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, t: number) {
  const angle = t * 1.4
  const dx = Math.cos(angle) * w * 0.6
  const dy = Math.sin(angle) * w * 0.25
  const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  gradient.addColorStop(0, PEACH)
  gradient.addColorStop(0.3, MINT)
  gradient.addColorStop(0.65, SKY)
  gradient.addColorStop(1, TEAL)
  return gradient
}

export function drawReel(ctx: CanvasRenderingContext2D, width: number, height: number, t: number) {
  const unit = Math.min(width, height * 0.9) / 100
  const cx = width / 2
  const cy = height / 2
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#030404'
  ctx.fillRect(0, 0, width, height)

  ctx.font = `600 ${unit * 6.2}px "Space Grotesk", Montserrat, sans-serif`
  const headlineWidth = ctx.measureText(HEADLINE).width
  const pillW = unit * 15
  const pillH = unit * 7.2
  const rowWidth = headlineWidth + unit * 3.5 + pillW
  const textX = cx - rowWidth / 2
  const pillX = textX + headlineWidth + unit * 3.5
  const lineX0 = cx - unit * 32
  const lineX1 = cx + unit * 32

  /* 1 · the sparkle: outline, spin, fill, collapse toward the line's start */
  if (t < 1.45) {
    const grow = easeBack(span(t, 0, 0.45))
    const filled = span(t, 0.5, 0.7)
    const collapse = easeInOut(span(t, 0.85, 1.4))
    const size = unit * mix(mix(0.5, 5.5, grow), 0.4, collapse) * (1 + 0.25 * Math.sin(span(t, 0.5, 0.9) * Math.PI))
    const x = mix(cx + unit * 4, lineX0, collapse)
    const y = mix(cy - unit * 6, cy, collapse)
    ambient(ctx, x, y, unit * 18, 'rgba(157,250,176,0.35)', filled * (1 - collapse))
    sparkle(ctx, x, y, size, t * 2.2, filled > 0 ? (filled > 0.5 ? MINT : SKY) : null, filled < 1 ? 'rgba(255,255,255,0.9)' : null)
  }

  /* 2 · the line of light, tilted, with the headline typing above it */
  const lineIn = easeOut(span(t, 1.3, 1.95))
  const lineToPill = easeInOut(span(t, 2.6, 3.05))
  if (t >= 1.3 && t < 4.35) {
    const tilt = mix(-0.07, 0, easeInOut(span(t, 1.9, 2.6)))
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(tilt)
    ctx.translate(-cx, -cy)

    // The line becomes the pill: ends slide in, thickness grows.
    const left = mix(lineX0, pillX, lineToPill)
    const right = mix(mix(lineX0, lineX1, lineIn), pillX + pillW, lineToPill)
    const thickness = mix(unit * 0.35, pillH, lineToPill)
    const top = mix(cy + unit * 3, cy - pillH / 2, lineToPill)

    // The bloom under the line, the reference's signature light.
    ambient(ctx, (left + right) / 2, cy + unit * 7 * (1 - lineToPill), unit * 34, 'rgba(139,211,255,0.5)', lineIn)
    ambient(ctx, (left + right) / 2, cy + unit * 3, unit * 18, 'rgba(157,250,176,0.35)', lineIn * (1 - lineToPill))
    ambient(ctx, right, cy, unit * 12, 'rgba(255,171,132,0.55)', lineIn * (1 - lineToPill * 0.5))

    ctx.save()
    roundedRect(ctx, left, top, Math.max(1, right - left), thickness, thickness / 2)
    const lineGradient = ctx.createLinearGradient(left, 0, right, 0)
    lineGradient.addColorStop(0, SKY)
    lineGradient.addColorStop(0.55, MINT)
    lineGradient.addColorStop(1, PEACH)
    ctx.shadowColor = lineToPill > 0.5 ? MINT : SKY
    ctx.shadowBlur = unit * (2 + 3 * lineToPill)
    ctx.fillStyle = lineToPill > 0.6 ? '#050606' : lineGradient
    ctx.fill()
    if (lineToPill > 0.6) {
      ctx.lineWidth = unit * 0.45
      ctx.strokeStyle = lineGradient
      ctx.stroke()
    }
    ctx.restore()

    // Pill icon and its breathing glow.
    if (lineToPill > 0.7) {
      const pulse = 0.5 + 0.5 * Math.sin((t - 3) * 5)
      ambient(ctx, pillX + pillW / 2, cy, unit * 12, 'rgba(157,250,176,0.35)', 0.5 + pulse * 0.3)
      sparkle(ctx, pillX + pillW / 2, cy, unit * 1.9, t * 1.5, '#ffffff', null)
    }

    // Headline: types on above the line, then settles beside the pill.
    const typed = Math.floor(HEADLINE.length * span(t, 1.55, 2.45))
    const settle = lineToPill
    const textY = mix(cy - unit * 1.2, cy + unit * 2.2, settle)
    const fadeOut = 1 - span(t, 4.15, 4.35)
    ctx.globalAlpha = fadeOut
    ctx.fillStyle = '#f4fff7'
    ctx.textBaseline = 'alphabetic'
    const shown = HEADLINE.slice(0, typed)
    ctx.fillText(shown, textX, textY)
    if (t < 2.6 && typed < HEADLINE.length) {
      sparkle(ctx, textX + ctx.measureText(shown).width + unit * 1.6, textY - unit * 2.4, unit * 1.3, t * 4, SKY, null)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  /* 3 · the pill opens into the Spyda AI composer */
  if (t >= 4.2) {
    const open = easeInOut(span(t, 4.2, 4.85))
    const exit = easeInOut(span(t, 7.3, 7.85))
    const cardW = Math.min(width * 0.86, unit * 92)
    const cardH = cardW * 0.42
    const w = mix(pillW, cardW, open)
    const h = mix(pillH, cardH, open)
    const x = mix(pillX + pillW / 2, cx, open) - w / 2
    const y = cy - h / 2
    const radius = mix(pillH / 2, unit * 5, open)

    ctx.globalAlpha = 1 - exit
    // Light thrown around the card, drifting slowly so it never sits still.
    const drift = Math.sin(t * 1.3)
    ambient(ctx, cx - w * (0.32 + 0.05 * drift), y + h * 0.05, w * 0.62, 'rgba(18,134,111,0.75)', open)
    ambient(ctx, cx + w * (0.38 - 0.05 * drift), y + h * 1.0, w * 0.6, 'rgba(139,211,255,0.6)', open)
    ambient(ctx, cx - w * 0.48, y + h * 0.95, w * 0.34, 'rgba(255,171,132,0.5)', open)
    ambient(ctx, cx + w * 0.3, y - h * 0.05, w * 0.3, 'rgba(157,250,176,0.45)', open)
    ctx.globalAlpha = 1 - exit

    ctx.save()
    roundedRect(ctx, x, y, w, h, radius)
    ctx.fillStyle = '#060707'
    ctx.shadowColor = MINT
    ctx.shadowBlur = unit * 6
    ctx.fill()
    // The border blooms in layers, widest first, like light on glass.
    const border = travellingGradient(ctx, cx, cy, w, t)
    for (const [colour, blur, line] of [[TEAL, 12, 1.4], [SKY, 8, 1], [PEACH, 5, 0.8], [MINT, 2.5, 0.55]] as const) {
      ctx.shadowColor = colour
      ctx.shadowBlur = unit * blur * open
      ctx.lineWidth = unit * line
      ctx.strokeStyle = border
      ctx.stroke()
    }
    ctx.restore()

    const inside = span(t, 4.75, 5.05)
    if (inside > 0) {
      const pad = unit * 4.5
      ctx.globalAlpha = inside * (1 - exit)

      // The prompt types in, with a caret.
      ctx.font = `500 ${unit * 3.6}px "Space Grotesk", Montserrat, sans-serif`
      ctx.fillStyle = '#eafff1'
      ctx.textBaseline = 'middle'
      const typed = PROMPT.slice(0, Math.floor(PROMPT.length * span(t, 5.0, 6.4)))
      ctx.fillText(typed, x + pad, y + h * 0.34)
      if (Math.floor(t * 2.5) % 2 === 0 || t < 6.4) {
        const caretX = x + pad + ctx.measureText(typed).width + unit * 0.6
        ctx.fillStyle = MINT
        ctx.fillRect(caretX, y + h * 0.34 - unit * 2, unit * 0.35, unit * 4)
      }

      // Controls arrive one after another, like the composer's.
      const controls = [
        { label: 'Import file', at: 5.1 },
        { label: 'Motion', at: 5.25, active: true },
      ]
      ctx.font = `600 ${unit * 2.4}px Montserrat, sans-serif`
      let cursorX = x + pad
      for (const control of controls) {
        const k = easeBack(span(t, control.at, control.at + 0.35))
        const textWidth = ctx.measureText(control.label).width
        const cw = textWidth + unit * 5
        const ch = unit * 5.6
        const cyControl = y + h - pad - ch / 2 + (1 - k) * unit * 2
        ctx.save()
        ctx.globalAlpha = clamp(k) * inside * (1 - exit)
        roundedRect(ctx, cursorX, cyControl - ch / 2, cw, ch, ch / 2)
        ctx.fillStyle = control.active ? MINT : 'rgba(255,255,255,0.06)'
        ctx.fill()
        if (!control.active) {
          ctx.strokeStyle = 'rgba(255,255,255,0.14)'
          ctx.lineWidth = unit * 0.25
          ctx.stroke()
        }
        ctx.fillStyle = control.active ? '#062016' : 'rgba(234,255,241,0.75)'
        ctx.textBaseline = 'middle'
        ctx.fillText(control.label, cursorX + unit * 2.5, cyControl + unit * 0.15)
        ctx.restore()
        cursorX += cw + unit * 1.6
      }

      // Send button, which lights when the prompt is complete.
      const ready = span(t, 6.4, 6.7)
      const sendR = unit * 3.6
      const sx = x + w - pad - sendR
      const sy = y + h - pad - unit * 2.8
      ctx.save()
      ctx.beginPath()
      ctx.arc(sx, sy, sendR, 0, Math.PI * 2)
      ctx.fillStyle = ready > 0 ? MINT : 'rgba(255,255,255,0.08)'
      ctx.shadowColor = MINT
      ctx.shadowBlur = unit * 3 * ready
      ctx.fill()
      ctx.strokeStyle = ready > 0 ? '#062016' : 'rgba(234,255,241,0.6)'
      ctx.lineWidth = unit * 0.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(sx, sy + sendR * 0.45)
      ctx.lineTo(sx, sy - sendR * 0.45)
      ctx.moveTo(sx - sendR * 0.35, sy - sendR * 0.1)
      ctx.lineTo(sx, sy - sendR * 0.45)
      ctx.lineTo(sx + sendR * 0.35, sy - sendR * 0.1)
      ctx.stroke()
      ctx.restore()

      // A pointer glides in and taps send.
      const glide = easeInOut(span(t, 5.6, 6.6))
      const tap = span(t, 6.65, 6.8) - span(t, 6.8, 6.95)
      const px = mix(x + w * 0.55, sx + unit * 0.8, glide)
      const py = mix(y + h * 0.75, sy + unit * 0.8, glide)
      ctx.save()
      ctx.translate(px, py)
      ctx.scale(1 - tap * 0.15, 1 - tap * 0.15)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, unit * 4.2)
      ctx.lineTo(unit * 1.1, unit * 3.1)
      ctx.lineTo(unit * 2.1, unit * 5)
      ctx.lineTo(unit * 2.8, unit * 4.6)
      ctx.lineTo(unit * 1.8, unit * 2.8)
      ctx.lineTo(unit * 3.2, unit * 2.8)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#050606'
      ctx.lineWidth = unit * 0.3
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      ctx.globalAlpha = 1
    }
    ctx.globalAlpha = 1
  }
}
