import { supabase } from './supabase'

export type MarketplaceTemplate = {
  id: string
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

export async function listTemplate(input: {
  name: string
  category: string
  price: number
  imageUrl: string
  imagePath: string
  description?: string
}): Promise<MarketplaceTemplate> {
  const { data, error } = await supabase.rpc('list_marketplace_template', {
    p_name: input.name,
    p_category: input.category,
    p_price: input.price,
    p_image_url: input.imageUrl,
    p_image_path: input.imagePath,
    p_description: input.description ?? null,
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
}
