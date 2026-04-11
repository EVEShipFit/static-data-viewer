const NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  zh: "Chinese",
};

export const SPLASH_LANGUAGE_CODES = Object.keys(NAMES) as (keyof typeof NAMES)[];

export const SPLASH_LANGUAGE_OPTIONS: { code: string; name: string }[] = SPLASH_LANGUAGE_CODES.map(
  (code) => ({
    code,
    name: NAMES[code] ?? code,
  }),
);
