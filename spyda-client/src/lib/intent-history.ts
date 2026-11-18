import type { DesignDocument } from '../core/design-document.js'
import {
  applyEditIntent,
  type ConstraintViolation,
  type DesignEditIntent,
} from '../core/constraint-engine.js'

/**
 * Undo/redo as a replayable intent log.
 *
 * The document is never stored frame by frame. It is the base document folded
 * through every step in the log, so the same log always produces the same
 * document. That is what lets the editor, the typed-instruction door and the
 * video sampler agree without keeping parallel state.
 *
 * A step is a list of intents because some edits only make sense together - a
 * layer swap is two `zIndex` intents, and undo has to reverse both at once.
 * A rejected step is not recorded: a no-op entry in the log would make undo look
 * broken, so the violation is handed back to the caller to explain instead.
 *
 * Consecutive edits to the same value can be folded into one step. Without that,
 * typing a word leaves one undo per letter, and the first press of undo appears
 * to do nothing at all.
 */

export type EditStep = {
  /** Short description for the undo tooltip. */
  label: string
  intents: DesignEditIntent[]
}

export type CommitOptions = {
  label?: string
  /**
   * Identity of an edit stream. Commits with the same key, inside
   * `COALESCE_WINDOW_MS` and with nothing undone in between, replace the last
   * step instead of adding one. Only safe for absolute values - `duplicate` and
   * `removed` must never be given a key.
   */
  coalesceKey?: string
  /** Test seam for the merge window. */
  now?: number
}

export type IntentHistory = {
  /** The document before any step in the log. */
  base: DesignDocument
  steps: EditStep[]
  /** Number of steps currently applied. */
  cursor: number
  maxDepth: number
  /**
   * The document at `cursor`: a cache of the fold, not a second source of truth.
   * Every mutation here also has a matching log entry, and undo/redo recompute it
   * from `base` so the two can never drift. It exists because replaying a long
   * log on every keystroke would be quadratic in typing speed.
   */
  tip: DesignDocument
  /** When and where the last step was committed, for folding edit streams. */
  lastCommit: { key: string; at: number } | null
}

export type CommitResult = {
  history: IntentHistory
  document: DesignDocument
  violations: ConstraintViolation[]
  /** False when the step was rejected and the log is untouched. */
  recorded: boolean
}

export const DEFAULT_HISTORY_DEPTH = 200

/** How long an edit stream stays open for folding. */
export const COALESCE_WINDOW_MS = 900

export function createHistory(document: DesignDocument, maxDepth = DEFAULT_HISTORY_DEPTH): IntentHistory {
  return {
    base: structuredClone(document),
    steps: [],
    cursor: 0,
    maxDepth,
    tip: structuredClone(document),
    lastCommit: null,
  }
}

function applyStep(document: DesignDocument, step: EditStep) {
  return step.intents.reduce(
    (current, intent) => applyEditIntent(current, intent).document,
    document,
  )
}

/** Folds the log up to an arbitrary cursor, which is what makes replay exact. */
export function documentAt(history: IntentHistory, cursor = history.cursor): DesignDocument {
  const stop = Math.max(0, Math.min(cursor, history.steps.length))
  let document = structuredClone(history.base)
  for (let index = 0; index < stop; index += 1) {
    document = applyStep(document, history.steps[index])
  }
  return document
}

/** Rebuilds `history` from the given document, dropping any previous log. */
export function adoptDocument(history: IntentHistory, document: DesignDocument): IntentHistory {
  return createHistory(document, history.maxDepth)
}

export function currentDocument(history: IntentHistory) {
  return history.tip
}

export function commitStep(
  history: IntentHistory,
  intents: DesignEditIntent[],
  options: CommitOptions | string = {},
): CommitResult {
  if (!intents.length) {
    return { history, document: history.tip, violations: [], recorded: false }
  }

  let document = history.tip
  const violations: ConstraintViolation[] = []
  for (const intent of intents) {
    const applied = applyEditIntent(document, intent)
    document = applied.document
    violations.push(...applied.violations)
  }

  if (violations.length) {
    return { history, document, violations, recorded: false }
  }

  const settings: CommitOptions = typeof options === 'string' ? { label: options } : options
  const now = settings.now ?? Date.now()
  const step: EditStep = {
    label: settings.label || intents.map(intent => intent.property).join(', '),
    intents,
  }

  const key = settings.coalesceKey
  const last = history.lastCommit
  const stillFolding = key !== undefined
    && last !== null
    && history.cursor === history.steps.length
    && last.key === key
    && now - last.at <= COALESCE_WINDOW_MS

  if (stillFolding) {
    // Absolute values, so replacing the tail step is enough and replay still
    // lands on `document`.
    const steps = [...history.steps]
    steps[steps.length - 1] = step
    return {
      history: { ...history, steps, tip: document, lastCommit: { key: String(key), at: now } },
      document,
      violations: [],
      recorded: true,
    }
  }

  // A new edit after undoing discards the abandoned tail, like every editor.
  let steps = [...history.steps.slice(0, history.cursor), step]
  let base = history.base

  if (steps.length > history.maxDepth) {
    // Fold the oldest step into the base rather than dropping its effect.
    base = applyStep(structuredClone(base), steps[0])
    steps = steps.slice(1)
  }

  return {
    history: {
      base,
      steps,
      cursor: steps.length,
      maxDepth: history.maxDepth,
      tip: document,
      lastCommit: key ? { key, at: now } : history.lastCommit,
    },
    document,
    violations: [],
    recorded: true,
  }
}

export function commitIntent(
  history: IntentHistory,
  intent: DesignEditIntent,
  options: CommitOptions | string = {},
): CommitResult {
  return commitStep(history, [intent], options)
}

export function canUndo(history: IntentHistory) {
  return history.cursor > 0
}

export function canRedo(history: IntentHistory) {
  return history.cursor < history.steps.length
}

export function undo(history: IntentHistory): IntentHistory {
  if (!canUndo(history)) return history
  const cursor = history.cursor - 1
  return { ...history, cursor, tip: documentAt(history, cursor) }
}

export function redo(history: IntentHistory): IntentHistory {
  if (!canRedo(history)) return history
  const cursor = history.cursor + 1
  return { ...history, cursor, tip: documentAt(history, cursor) }
}

/** What undo/redo would step over, for the button tooltips. */
export function nextUndoLabel(history: IntentHistory) {
  return canUndo(history) ? history.steps[history.cursor - 1].label : null
}

export function nextRedoLabel(history: IntentHistory) {
  return canRedo(history) ? history.steps[history.cursor].label : null
}
