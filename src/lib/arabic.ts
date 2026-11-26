const ARABIC_DIACRITIC_CODES = new Set<number>([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0640, 0x0670, 0x0654, 0x0655,
]);
const ARABIC_HAMZAS_TO_ALIF = /[\u0623\u0625\u0622\u0671]/g;
const ARABIC_TA_TO_HEH = /\u0629/g;
const ARABIC_ALIF_TO_YEH = /\u0649/g;
const ARABIC_WAW_TO_YEH = /[\u0624\u0626]/g;

function removeDiacritics(input: string): string {
  return [...input].filter((ch) => !ARABIC_DIACRITIC_CODES.has(ch.codePointAt(0) ?? 0)).join("");
}

/** Normalizes Arabic text so searches ignore letter-form differences and diacritics. */
export function normalizeArabic(input: string): string {
  return removeDiacritics(input)
    .toLowerCase()
    .replace(ARABIC_HAMZAS_TO_ALIF, "ا")
    .replace(ARABIC_TA_TO_HEH, "ه")
    .replace(ARABIC_ALIF_TO_YEH, "ي")
    .replace(ARABIC_WAW_TO_YEH, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearch(haystack: (string | null | undefined)[], query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return haystack.some((h) => h && normalizeArabic(h).includes(q));
}

export const usernameToEmail = (u: string) =>
  `${u
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")}@users.suhailsoft.app`;

export const loginIdentifierToEmail = (value: string) => {
  const identifier = value.trim();
  return identifier.includes("@") ? identifier.toLowerCase() : usernameToEmail(identifier);
};
