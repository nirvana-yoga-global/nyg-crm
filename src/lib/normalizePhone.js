export function normalizePhone(raw) {
  if (raw == null) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!digits) return null
  if (digits.length === 10 && /^[6-9]/.test(digits)) return '91' + digits
  if (digits.length === 11 && digits[0] === '0' && /^[6-9]/.test(digits[1])) return '91' + digits.slice(1)
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}
