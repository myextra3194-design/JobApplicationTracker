/**
 * Fixed, deterministic tag colours. Tailwind scans these complete class strings;
 * do not replace them with utility names assembled from a hue variable.
 */
const TAG_TONE_CLASSES: readonly string[] = [
  'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
  'border-lime-500/30 bg-lime-500/10 text-lime-200',
  'border-orange-500/30 bg-orange-500/10 text-orange-200',
  'border-pink-500/30 bg-pink-500/10 text-pink-200',
  'border-teal-500/30 bg-teal-500/10 text-teal-200',
  'border-violet-500/30 bg-violet-500/10 text-violet-200',
  'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
];

const EMPTY_TAG_TONE = 'border-hairline bg-surface-raised text-slate-300';

/**
 * Return one complete Tailwind class string for a tag. Case and surrounding
 * whitespace do not affect the colour, so the same tag is stable wherever it
 * appears in the app and across browser sessions.
 */
export function tagColor(tag: string): string {
  const value = tag.trim().toLowerCase();
  if (value === '') return EMPTY_TAG_TONE;

  // FNV-1a over UTF-16 code units: small, deterministic, and available in every
  // browser without depending on locale-specific hashing.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return TAG_TONE_CLASSES[(hash >>> 0) % TAG_TONE_CLASSES.length] ?? EMPTY_TAG_TONE;
}
