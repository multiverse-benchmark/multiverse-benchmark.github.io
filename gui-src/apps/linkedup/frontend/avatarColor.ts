const AVATAR_PALETTE = [
  '#0A66C2',
  '#7B1FA2',
  '#2E7D32',
  '#D84315',
  '#C2185B',
  '#00838F',
  '#5D4037',
  '#EF6C00',
  '#455A64',
  '#AD1457',
  '#558B2F',
  '#B71C1C',
] as const

export function getAvatarColor(seed: string | null | undefined): string {
  if (!seed) return AVATAR_PALETTE[0]
  let hash = 5381
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[idx]
}
