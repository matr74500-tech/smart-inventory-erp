import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeArabic, usernameToEmail } from "./arabic";

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
});
