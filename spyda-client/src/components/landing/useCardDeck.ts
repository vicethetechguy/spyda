import { useCallback, useEffect, useRef } from 'react'

/**
 * Cards that behave like a deck: when the grid scrolls into view its cards
 * start stacked in the middle and are dealt out to their places, each card
 * tilts toward the mouse, and `shuffle` gathers them back into the deck,
 * riffles it and deals them out again in a new order.
 *
 * With reduced motion asked for, the cards simply appear in place.
 */

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.35)'
const TILT = 7

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const cards = (deck: HTMLElement) => [...deck.children].filter((node): node is HTMLElement => node instanceof HTMLElement)

/** A small, stable lean for card `i`, so the stacked deck looks hand-held. */
const lean = (i: number) => ((i * 47) % 13) - 6

/** How far card `card` sits from the middle of the deck. */
function offset(deck: HTMLElement, card: HTMLElement) {
  const box = deck.getBoundingClientRect()
  const own = card.getBoundingClientRect()
  return {
    x: box.left + box.width / 2 - (own.left + own.width / 2),
    y: box.top + Math.min(box.height, window.innerHeight) / 2 - (own.top + own.height / 2),
  }
}

function deal(deck: HTMLElement) {
  cards(deck).forEach((card, i) => {
    card.getAnimations().forEach(animation => animation.cancel())
    const { x, y } = offset(deck, card)
    card.style.opacity = ''
    card.animate([
      { transform: `translate(${x}px, ${y}px) rotate(${lean(i)}deg) scale(0.86)`, opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.25 },
      { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 },
    ], { duration: 820, delay: i * 70, easing: EASE_OUT, fill: 'backwards' })
  })
}

function gather(deck: HTMLElement) {
  const moves = cards(deck).map((card, i) => {
    const { x, y } = offset(deck, card)
    // A riffle: alternate cards come in from just left and just right of the middle.
    const side = i % 2 ? 1 : -1
    return card.animate([
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
      { transform: `translate(${x + side * 26}px, ${y}px) rotate(${side * 9}deg) scale(0.88)`, offset: 0.7 },
      { transform: `translate(${x}px, ${y}px) rotate(${lean(i)}deg) scale(0.86)` },
    ], { duration: 520, delay: i * 28, easing: EASE_IN, fill: 'forwards' }).finished
  })
  return Promise.all(moves)
}

export function useCardDeck<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const deck = ref.current
    if (!deck || reducedMotion()) return

    // Hidden until dealt, so the cards don't flash in place first.
    cards(deck).forEach(card => { card.style.opacity = '0' })
    const seen = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      seen.disconnect()
      deal(deck)
    }, { threshold: 0.18 })
    seen.observe(deck)

    // The 3D lean toward the mouse needs depth on the grid.
    deck.style.perspective = '1400px'
    let lit: HTMLElement | null = null
    const settle = (card: HTMLElement | null) => {
      if (!card) return
      card.style.transition = 'rotate 450ms cubic-bezier(0.16, 1, 0.3, 1)'
      card.style.rotate = ''
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || busy.current) return
      const card = cards(deck).find(child => child.contains(event.target as Node)) ?? null
      if (card !== lit) { settle(lit); lit = card }
      if (!card) return
      const box = card.getBoundingClientRect()
      const px = (event.clientX - box.left) / box.width - 0.5
      const py = (event.clientY - box.top) / box.height - 0.5
      card.style.transition = 'rotate 120ms linear'
      // The axis is perpendicular to the pointer's offset, so the card dips toward the mouse.
      card.style.rotate = `${-py} ${px} 0 ${Math.hypot(px, py) * TILT * 2}deg`
    }
    const leave = () => { settle(lit); lit = null }
    deck.addEventListener('pointermove', move)
    deck.addEventListener('pointerleave', leave)
    return () => {
      seen.disconnect()
      deck.removeEventListener('pointermove', move)
      deck.removeEventListener('pointerleave', leave)
      cards(deck).forEach(card => { card.style.opacity = ''; card.style.rotate = '' })
    }
  }, [])

  /**
   * Gathers the cards, calls `reorder` (which should change their order in
   * React), then deals the new order out once it has rendered.
   */
  const shuffle = useCallback(async (reorder: () => void) => {
    const deck = ref.current
    if (!deck || busy.current) return
    if (reducedMotion()) { reorder(); return }
    busy.current = true
    cards(deck).forEach(card => { card.style.rotate = '' })
    await gather(deck)
    reorder()
    // Two frames: React commits the new order, then the browser lays it out.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    deal(deck)
    window.setTimeout(() => { busy.current = false }, 900)
  }, [])

  return { ref, shuffle }
}
