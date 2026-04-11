function pickTranslation(
  map: Record<string, unknown>,
  selectedLang: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(map, selectedLang)) {
    return map[selectedLang];
  }
  if (Object.prototype.hasOwnProperty.call(map, "en")) {
    return map.en;
  }
  const keys = Object.keys(map);
  return keys.length ? map[keys[0]] : null;
}

function isTranslationMap(o: Record<string, unknown>, langCodes: Set<string>): boolean {
  const keys = Object.keys(o);
  if (keys.length === 0) return false;
  return keys.every((k) => langCodes.has(k));
}

export function stripTranslations(
  value: unknown,
  selectedLang: string,
  langCodes: Set<string>,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripTranslations(v, selectedLang, langCodes));
  }

  const o = value as Record<string, unknown>;
  if (isTranslationMap(o, langCodes)) {
    const picked = pickTranslation(o, selectedLang);
    return stripTranslations(picked, selectedLang, langCodes);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = stripTranslations(v, selectedLang, langCodes);
  }
  return out;
}
