import { useEffect, useRef, useCallback } from "react";

export interface HIDScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;
  maxLength?: number;
  timeoutMs?: number;
  ignoreInInputs?: boolean;
  enabled?: boolean;
}

const DEFAULT_MIN_LENGTH = 3;
const DEFAULT_MAX_LENGTH = 100;
const DEFAULT_TIMEOUT_MS = 200;

export function useHIDScanner({
  onScan,
  minLength = DEFAULT_MIN_LENGTH,
  maxLength = DEFAULT_MAX_LENGTH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ignoreInInputs = true,
  enabled = true,
}: HIDScannerOptions) {
  const bufferRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const flushBuffer = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (code.length >= minLength && code.length <= maxLength) {
      onScanRef.current(code);
    }
  }, [minLength, maxLength]);

  useEffect(() => {
    if (!enabledRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (ignoreInInputs) {
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isInput = tagName === "input" || tagName === "textarea" || target.isContentEditable;
        if (isInput) return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        flushBuffer();
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushBuffer, timeoutMs);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flushBuffer, timeoutMs, ignoreInInputs]);

  return { flushBuffer };
}
