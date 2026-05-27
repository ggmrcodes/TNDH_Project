// Up to two initials from a display name, skipping common honorifics (TH + EN).
// Returns null for non-name labels like "HC-972634" so callers fall back to an
// icon. Shared by the chat thread header and the conversation list so the
// avatar treatment stays identical.
export function deriveInitials(name: string): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed || /^HC-/i.test(trimmed)) return null;
  const cleaned = trimmed.replace(/^(dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?|นพ\.?|พญ\.?|คุณ)\s*/i, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.slice(0, 2).map((w) => w[0]).join('');
  return /[A-Za-z฀-๿]/.test(letters) ? letters.toUpperCase() : null;
}
