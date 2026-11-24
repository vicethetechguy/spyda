/** The video studio's pages, left to right in the order a video is made. */
export type StudioPage = 'media' | 'photo' | 'cut' | 'edit' | 'color' | 'mixer' | 'export'

/** Shift + this number opens the page (pages still being built have none). */
export const PAGE_KEYS: Record<string, StudioPage> = { '1': 'media', '2': 'photo', '4': 'edit', '7': 'export' }
