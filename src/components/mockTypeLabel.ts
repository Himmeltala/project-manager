const TYPE_LABELS: Record<string, string> = {
  npm: 'npm',
  maven: 'Maven',
}

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}
