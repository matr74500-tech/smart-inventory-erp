export type SharePayload = {
  title: string;
  text: string;
  url?: string;
  files?: File[];
};

export function buildWhatsAppUrl(text: string, phone?: string): string {
  const clean = (phone ?? "").replace(/[^\d+]/g, "");
  const num = clean.startsWith("+") ? clean.slice(1) : clean;
  const encoded = encodeURIComponent(text);
  if (num) return `https://wa.me/${num}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

export async function shareTextOrFile(
  payload: SharePayload,
): Promise<"shared" | "copied" | "opened"> {
  try {
    if (typeof navigator !== "undefined" && payload.files?.length && "canShare" in navigator) {
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: payload.files })) {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          files: payload.files,
          url: payload.url,
        });
        return "shared";
      }
    }
    if (typeof navigator !== "undefined" && "share" in navigator && payload.text) {
      await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
      return "shared";
    }
  } catch {
    // user cancelled or not supported
    return "opened";
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(
      `${payload.title}\n${payload.text}${payload.url ? `\n${payload.url}` : ""}`,
    );
    return "copied";
  }
  return "opened";
}
