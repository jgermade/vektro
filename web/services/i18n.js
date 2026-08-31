import { load } from "js-yaml";
import esContent from "../messages/es.yml?raw";
import enContent from "../messages/en.yml?raw";

const dictionaries = {
  es: load(esContent) || {},
  en: load(enContent) || {},
};

function detectLocale() {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages || [navigator.language || navigator.userLanguage || "en"];
  for (const lang of langs) {
    if (!lang) continue;
    const code = lang.toLowerCase();
    if (code.startsWith("es")) return "es";
    if (code.startsWith("en")) return "en";
  }
  return "en"; // Fallback to English
}

export const currentLocale = detectLocale();
const currentDict = dictionaries[currentLocale] || dictionaries.en;
const fallbackDict = dictionaries.en;

export function t(key, defaultText) {
  return currentDict[key] ?? fallbackDict[key] ?? defaultText ?? key;
}
