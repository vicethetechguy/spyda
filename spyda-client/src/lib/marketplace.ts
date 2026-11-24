import { supabase } from './supabase'

export type MarketplaceKind = 'flyer' | 'motion'

export type MarketplaceTemplate = {
  id: string
  /** Missing on rows from before motion listings: those are flyers. */
  kind?: MarketplaceKind
  /** The deliverable in the private bucket (motion video or HTML). */
  file_path?: string | null
  file_type?: string | null
  /** An editable Spyda design (layers, or a video project) the buyer opens in the editor. */
  editable?: boolean | null
  owner_id: string
  name: string
  category: string
  description: string | null
  price: number
  image_url: string
  image_path: string | null
  created_at: string
}

// Charged to the lister when a template is published (enforced server-side too).
export const TEMPLATE_LISTING_FEE = 5

export async function fetchTemplateCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('template_categories')
    .select('name')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => row.name as string)
}

export async function fetchMarketplaceTemplates(): Promise<MarketplaceTemplate[]> {
  const { data, error } = await supabase
    .from('marketplace_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MarketplaceTemplate[]
}

export async function fetchMyPurchases(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('template_purchases')
    .select('template_id')
    .eq('buyer_id', userId)
  if (error) throw error
  return new Set((data ?? []).map(row => row.template_id as string))
}

export async function uploadTemplateImage(userId: string, file: File): Promise<{ url: string; path: string }> {
  const rawExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const ext = rawExt.length > 5 ? 'jpg' : rawExt
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('template-images')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('template-images').getPublicUrl(path)
  return { url: data.publicUrl, path }
}

/** The largest motion file a lister can upload (the bucket enforces it too). */
export const MOTION_FILE_LIMIT = 100 * 1024 * 1024

/** Uploads a motion deliverable to the private bucket, under the lister's folder. */
export async function uploadTemplateFile(userId: string, file: File): Promise<{ path: string; type: string }> {
  const rawExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const ext = rawExt.length > 5 ? 'mp4' : rawExt
  const type = file.type || (ext === 'html' ? 'text/html' : ext === 'webm' ? 'video/webm' : 'video/mp4')
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('template-files')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: type })
  if (error) throw error
  return { path, type }
}

/** A short-lived link to an unlocked deliverable. Storage refuses it unless the reader owns or bought it. */
export async function templateFileUrl(template: MarketplaceTemplate): Promise<string> {
  if (!template.file_path) throw new Error('This listing has no file to download.')
  const name = `${template.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'spyda-motion'}.${template.file_path.split('.').pop()}`
  const { data, error } = await supabase.storage.from('template-files').createSignedUrl(template.file_path, 60 * 10, { download: name })
  if (error || !data?.signedUrl) throw new Error(error?.message || 'The file could not be opened.')
  return data.signedUrl
}

export async function listTemplate(input: {
  name: string
  category: string
  price: number
  imageUrl: string
  imagePath: string
  description?: string
  kind?: MarketplaceKind
  filePath?: string
  fileType?: string
  /** The file is a Spyda design package the buyer opens in the editor. */
  editable?: boolean
}): Promise<MarketplaceTemplate> {
  const { data, error } = await supabase.rpc('list_marketplace_template', {
    p_name: input.name,
    p_category: input.category,
    p_price: input.price,
    p_image_url: input.imageUrl,
    p_image_path: input.imagePath,
    p_description: input.description ?? null,
    // Flyers keep the original call shape, so they still list before the motion migration lands.
    ...(input.kind === 'motion' || input.editable ? { p_kind: input.kind ?? 'flyer', p_file_path: input.filePath ?? null, p_file_type: input.fileType ?? null } : {}),
    // Sent only for editable designs, so other listings work before the editable-designs migration lands.
    ...(input.editable ? { p_editable: true } : {}),
  })
  if (error) throw new Error(error.message)
  const template = (Array.isArray(data) ? data[0] : data) as MarketplaceTemplate | null
  if (!template?.id) throw new Error('The listing was saved, but Spyda did not receive the new template record. Refresh and try again.')
  return template
}

// Moves credits from the buyer to the lister. Idempotent server-side: an owner
// or an already-unlocked buyer is not charged again.
export async function purchaseTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('purchase_marketplace_template', { p_template_id: templateId })
  if (error) throw new Error(error.message)
}

export async function deleteTemplate(template: MarketplaceTemplate): Promise<void> {
  const { error } = await supabase.from('marketplace_templates').delete().eq('id', template.id)
  if (error) throw error
  if (template.image_path) {
    await supabase.storage.from('template-images').remove([template.image_path]).catch(() => undefined)
  }
  if (template.file_path) {
    await supabase.storage.from('template-files').remove([template.file_path]).catch(() => undefined)
  }
}

/** Uploads a Spyda design package (an editable design) to the private bucket. */
export async function uploadDesignPackage(userId: string, pkg: Blob): Promise<{ path: string; type: string }> {
  if (pkg.size > MOTION_FILE_LIMIT) throw new Error(`This design is ${Math.round(pkg.size / 1024 / 1024)} MB with its media. The marketplace takes up to ${MOTION_FILE_LIMIT / 1024 / 1024} MB: trim or remove clips you do not use and try again.`)
  const type = 'application/vnd.spyda.design'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.spyda`
  const { error } = await supabase.storage.from('template-files').upload(path, pkg, { cacheControl: '3600', upsert: false, contentType: type })
  if (error) throw new Error(error.message)
  return { path, type }
}

/** Downloads an editable design the reader owns or bought. */
export async function fetchDesignPackage(template: MarketplaceTemplate): Promise<Blob> {
  if (!template.file_path) throw new Error('This listing has no design file.')
  const { data, error } = await supabase.storage.from('template-files').download(template.file_path)
  if (error || !data) throw new Error(error?.message || 'The design could not be downloaded.')
  return data
}
