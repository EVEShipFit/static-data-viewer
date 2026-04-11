import { stripTranslations } from "./stripTranslations";

const textDecoder = new TextDecoder("utf-8", { fatal: false });
const textEncoder = new TextEncoder();

export function transformJsonlForLanguage(
  input: Uint8Array,
  selectedLang: string,
  langCodes: Set<string>,
): Uint8Array {
  const outLines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i <= input.length; i++) {
    if (i < input.length && input[i] !== 10) continue;
    const line = textDecoder.decode(input.subarray(lineStart, i)).replace(/\r$/, "");
    lineStart = i + 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as unknown;
      outLines.push(JSON.stringify(stripTranslations(obj, selectedLang, langCodes)));
    } catch {
      outLines.push(trimmed);
    }
  }
  const encoded = textEncoder.encode(outLines.join("\n"));
  // Force a plain ArrayBuffer-backed Uint8Array for stricter TS generic signatures.
  const ab = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );
  return new Uint8Array(ab);
}
