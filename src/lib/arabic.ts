/** Normalizes Arabic text so searches ignore letter-form differences (أ إ آ ا، ة ه، ى ي) and diacritics. */
export function normalizeArabic(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearch(haystack: (string | null | undefined)[], query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return haystack.some((h) => h && normalizeArabic(h).includes(q));
}

export const usernameToEmail = (u: string) =>
  `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@users.suhailsoft.app`;
