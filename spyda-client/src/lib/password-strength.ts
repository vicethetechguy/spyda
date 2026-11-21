/** A rough strength read for the sign-up meter; Supabase still enforces its own rules. */
export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!value) return { score: 0, label: '' }
  if (value.length < 8) return { score: 1, label: 'Too short' }
  let score = 2
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /(\d|[^A-Za-z0-9])/.test(value)) score += 1
  const clamped = Math.min(4, score) as 2 | 3 | 4
  return { score: clamped, label: clamped === 4 ? 'Strong' : clamped === 3 ? 'Good' : 'Fair' }
}
