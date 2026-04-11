export function parseTranslationLanguagesJsonl(bytes: Uint8Array): { code: string; name: string }[] {
  const dec = new TextDecoder("utf-8", { fatal: false });
  const out: { code: string; name: string }[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] !== 10) continue;
    const raw = dec.decode(bytes.subarray(start, i)).replace(/\r$/, "").trim();
    start = i + 1;
    if (!raw) continue;
    try {
      const row = JSON.parse(raw) as { _key?: unknown; name?: unknown };
      const code = row._key != null ? String(row._key) : "";
      const name = row.name != null ? String(row.name) : code;
      if (code) out.push({ code, name });
    } catch {
      /* skip bad line */
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export function codesFromLanguageList(list: { code: string }[]): Set<string> {
  return new Set(list.map((x) => x.code));
}
