function formatGroupedCode(value: string, prefixLength: number): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, prefixLength + 8)
  if (!clean) return ''

  const prefix = clean.slice(0, prefixLength)
  const firstGroup = clean.slice(prefixLength, prefixLength + 4)
  const secondGroup = clean.slice(prefixLength + 4, prefixLength + 8)

  let formatted = prefix
  if (clean.length >= prefixLength) formatted += '-'
  formatted += firstGroup
  if (clean.length >= prefixLength + 4) formatted += '-'
  formatted += secondGroup
  return formatted
}

export function formatSpydaWalletId(value: string): string {
  return formatGroupedCode(value, 3)
}

export function formatSpydaCouponCode(value: string): string {
  const isLegacyCode = value.toUpperCase().startsWith('SPY-')
  return formatGroupedCode(value, isLegacyCode ? 3 : 5)
}
