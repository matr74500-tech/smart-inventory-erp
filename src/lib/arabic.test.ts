import { describe, expect, it } from "vitest";
import { loginIdentifierToEmail, matchesSearch, normalizeArabic, usernameToEmail } from "./arabic";

describe("arabic search", () => {
  it("treats أ إ آ ا as the same letter", () => {
    expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("إبريق")).toBe("ابريق");
  });
  it("treats ة and ه as the same letter", () => {
    expect(matchesSearch(["علبة حليب"], "علبه")).toBe(true);
  });
  it("does not match unrelated words", () => {
    expect(matchesSearch(["سكر"], "ارز")).toBe(false);
  });
  it("maps usernames to a stable login email", () => {
    expect(usernameToEmail(" Ali ")).toBe("ali@users.suhailsoft.app");
  });
  it("accepts email addresses directly as login identifiers", () => {
    expect(loginIdentifierToEmail(" Alakhwttt@Gmail.com ")).toBe("alakhwttt@gmail.com");
    expect(loginIdentifierToEmail(" Ali ")).toBe("ali@users.suhailsoft.app");
  });
});

describe("matchesSearch", () => {
  it("matches on any field and returns true for an empty query", () => {
    expect(matchesSearch(["اسم", "كود"], "كود")).toBe(true);
    expect(matchesSearch(["سكر"], "")).toBe(true);
    expect(matchesSearch([null, undefined], "سكر")).toBe(false);
  });

  it("ignores diacritics in stored text and query", () => {
    expect(matchesSearch(["علبة حليب"], "حليب")).toBe(true);
    expect(matchesSearch(["علبة"], "علب")).toBe(true);
    expect(matchesSearch(["علبة"], "علبة")).toBe(true);
  });

  it("treats letter forms آ أ إ ى ة as equivalent", () => {
    expect(matchesSearch(["آلة"], "اله")).toBe(true);
    expect(matchesSearch(["قلم"], "ي")).toBe(false);
  });
});
