import { createStore, get, set } from 'idb-keyval'
import type { MotionFormat } from './motion-harness'

/**
 * The workspace chat: conversations, their images, and the two API calls.
 *
 * Conversations live in IndexedDB rather than localStorage because every turn
 * can carry a flyer, and a handful of flyers would exhaust localStorage.
 */

export type EditStatus = 'proposed' | 'generating' | 'done' | 'failed' | 'declined'

export type ChatEdit = {
  instruction: string
  summary: string
  status: EditStatus
  /** Credits this edit costs, fixed when it was proposed. */
  cost: number
  /** The flyer the edit applies to. */
  sourceImage: string
  resultImage?: string
  error?: string
  tokensAwarded?: number
}

/** A motion design Claude Opus 5.5 wrote for this conversation. */
export type ChatMotion = {
  status: 'generating' | 'done' | 'failed'
  brief: string
  format: MotionFormat
  duration: number
  /** The reference it animates. */
  sourceImage: string
  cost: number
  title?: string
  code?: string
  error?: string
  tokensAwarded?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  images?: string[]
  edit?: ChatEdit
  motion?: ChatMotion
  createdAt: string
  error?: boolean
}

export type Conversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  /** The saved project that canvas mode opens for this conversation's flyer. */
  projectId?: string
  /** Which flyer that project was built from, so a new version gets a new project. */
  projectSource?: string
  /** The first imported file's name, used to name the canvas project. */
  flyerName?: string
}

const store = createStore('spyda-chat', 'conversations')
const INDEX_KEY = 'index'
const MAX_CONVERSATIONS = 30

export function newId(prefix = 'm') {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function createConversation(): Conversation {
  const now = new Date().toISOString()
  return { id: newId('chat'), title: 'New chat', createdAt: now, updatedAt: now, messages: [] }
}

export type ConversationSummary = Pick<Conversation, 'id' | 'title' | 'updatedAt'>

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    return (await get<ConversationSummary[]>(INDEX_KEY, store)) ?? []
  } catch {
    return []
  }
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    return (await get<Conversation>(id, store)) ?? null
  } catch {
    return null
  }
}

export async function saveConversation(conversation: Conversation) {
  try {
    await set(conversation.id, conversation, store)
    const index = (await listConversations()).filter(item => item.id !== conversation.id)
    index.unshift({ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt })
    await set(INDEX_KEY, index.slice(0, MAX_CONVERSATIONS), store)
  } catch (error) {
    console.warn('Spyda could not save this chat on this device.', error)
  }
}

/** A title from the first thing the person said, like a chat app does. */
export function titleFrom(text: string, hasImage: boolean) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean) return clean.length > 48 ? `${clean.slice(0, 46)}…` : clean
  return hasImage ? 'Flyer breakdown' : 'New chat'
}

/** The newest finished motion, which a follow-up in motion mode revises. */
export function latestMotion(messages: ChatMessage[]): ChatMotion | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const motion = messages[index].motion
    if (motion?.status === 'done' && motion.code) return motion
  }
  return null
}

/** The flyer the conversation is about now: the newest generated or uploaded image. */
export function latestFlyer(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.edit?.resultImage) return message.edit.resultImage
    if (message.images?.length) return message.images[message.images.length - 1]
  }
  return null
}

export type PreparedImage = { dataUrl: string; width: number; height: number; name: string }

/**
 * Scales an image down to what the models read well and the API accepts.
 * JPEG at 1536px keeps a flyer's small print legible at a few hundred KB.
 */
export function prepareImage(file: File, maxEdge = 1536, quality = 0.88): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Import an image file (PNG, JPG or WEBP).'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!context) {
        reject(new Error('This browser cannot prepare the image.'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width, height, name: file.name || 'flyer.jpg' })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That image could not be opened.'))
    }
    image.src = url
  })
}

export function imageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** A remote or webp result re-encoded as JPEG, so the next request can send it. */
export async function toJpegDataUrl(src: string, maxEdge = 1536): Promise<string> {
  if (/^data:image\/jpe?g/i.test(src)) return src
  const response = await fetch(src)
  const blob = await response.blob()
  const prepared = await prepareImage(new File([blob], 'flyer', { type: blob.type || 'image/png' }), maxEdge)
  return prepared.dataUrl
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new Error('Your session has expired. Sign in again.')
  if (response.status === 413) throw new Error('That image is too large to send. Try a smaller file.')
  if (response.status === 408 || response.status === 504) throw new Error('The model took too long to answer. Try again.')
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Spyda could not answer (${response.status}).`)
  return payload as T
}

/** Only what the model needs: words and the images actually attached. */
function toApiTurns(messages: ChatMessage[]) {
  return messages
    .filter(message => !message.error)
    .map(message => ({
      role: message.role,
      text: message.edit?.status === 'done'
        ? `${message.text}\n[Generated a new version: ${message.edit.summary}]`
        : message.motion?.status === 'done'
          ? `[Made a motion design: ${message.motion.title || 'untitled'}]`
          : message.text || (message.motion ? '[Motion design]' : ''),
      images: message.role === 'user'
        ? message.images
        : message.edit?.status === 'done' && message.edit.resultImage?.startsWith('data:image/jpeg')
          ? [message.edit.resultImage]
          : undefined,
    }))
}

export async function requestReply(messages: ChatMessage[], headers: Record<string, string>) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'reply', messages: toApiTurns(messages) }),
  })
  return readJson<{ ok: true; reply: string; edit: { instruction: string; summary: string } | null }>(response)
}

export async function requestEdit(
  instruction: string,
  image: string,
  headers: Record<string, string>,
) {
  const dimensions = await imageDimensions(image)
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'edit', instruction, image, dimensions }),
  })
  return readJson<{
    ok: true
    image: string
    model: string
    billing?: { creditsCharged: number; tokensAwarded: number; walletBalance: number }
  }>(response)
}

export async function requestMotion(
  input: {
    image: string
    brief: string
    format: MotionFormat
    duration: number
    previousCode?: string
    runtimeError?: string
  },
  headers: Record<string, string>,
) {
  const response = await fetch('/api/motion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  })
  return readJson<{
    ok: true
    title: string
    code: string
    model: string
    billing?: { creditsCharged: number; tokensAwarded: number; walletBalance: number }
  }>(response)
}
