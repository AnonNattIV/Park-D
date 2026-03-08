import 'server-only';

import {
  translateThaiToEnglishText as fallbackTranslateThaiToEnglishText,
  translateToThaiDisplayText as fallbackTranslateToThaiDisplayText,
} from '@/lib/thai-address';

type TargetLanguage = 'en' | 'th';

const translationCache = new Map<string, string>();
const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;

function normalizeText(value: string): string {
  return value.trim();
}

function buildCacheKey(targetLanguage: TargetLanguage, text: string): string {
  return `${targetLanguage}:${text}`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function fallbackTranslate(value: string, targetLanguage: TargetLanguage): string {
  return targetLanguage === 'en'
    ? fallbackTranslateThaiToEnglishText(value)
    : fallbackTranslateToThaiDisplayText(value);
}

function shouldBypassTranslation(text: string, targetLanguage: TargetLanguage): boolean {
  if (!text) {
    return true;
  }

  const hasThaiChars = THAI_CHAR_REGEX.test(text);

  if (targetLanguage === 'en') {
    // For English target, non-Thai text is already acceptable.
    return !hasThaiChars;
  }

  // For Thai target, Thai text should be kept as-is.
  return hasThaiChars;
}

async function translateTextsViaGoogle(
  texts: string[],
  targetLanguage: TargetLanguage
): Promise<string[] | null> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim() || '';
  if (!apiKey) {
    return null;
  }

  const body = new URLSearchParams();
  texts.forEach((text) => {
    body.append('q', text);
  });
  body.set('target', targetLanguage);
  body.set('format', 'text');

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: {
      translations?: Array<{ translatedText?: string }>;
    };
  };

  const translations = payload.data?.translations || [];
  if (translations.length !== texts.length) {
    return null;
  }

  return translations.map((item, index) => {
    const translated = typeof item.translatedText === 'string' ? item.translatedText : texts[index];
    return decodeHtmlEntities(translated).trim();
  });
}

async function translateTextsViaLibreTranslate(
  texts: string[],
  targetLanguage: TargetLanguage
): Promise<string[] | null> {
  const apiUrl =
    process.env.LIBRE_TRANSLATE_URL?.trim() || 'https://libretranslate.com/translate';
  const apiKey = process.env.LIBRE_TRANSLATE_API_KEY?.trim() || '';

  const body: Record<string, unknown> = {
    q: texts,
    source: 'auto',
    target: targetLanguage,
    format: 'text',
  };

  if (apiKey) {
    body.api_key = apiKey;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as
    | Array<{ translatedText?: string }>
    | { translatedText?: string };

  if (Array.isArray(payload)) {
    if (payload.length !== texts.length) {
      return null;
    }

    return payload.map((item, index) => {
      const translated = typeof item.translatedText === 'string' ? item.translatedText : texts[index];
      return translated.trim();
    });
  }

  if (texts.length === 1 && typeof payload.translatedText === 'string') {
    return [payload.translatedText.trim()];
  }

  return null;
}

async function translateTextsViaApi(
  texts: string[],
  targetLanguage: TargetLanguage
): Promise<string[] | null> {
  const provider = (process.env.TRANSLATION_PROVIDER || 'google').trim().toLowerCase();

  try {
    if (provider === 'libretranslate' || provider === 'libre') {
      return await translateTextsViaLibreTranslate(texts, targetLanguage);
    }

    return await translateTextsViaGoogle(texts, targetLanguage);
  } catch (error) {
    console.error('Translation API failed:', error);
    return null;
  }
}

async function translateTexts(
  values: string[],
  targetLanguage: TargetLanguage
): Promise<string[]> {
  const normalizedValues = values.map((value) => normalizeText(value));
  const results = [...normalizedValues];
  const missingValues: string[] = [];

  for (let index = 0; index < normalizedValues.length; index += 1) {
    const text = normalizedValues[index];
    if (!text || shouldBypassTranslation(text, targetLanguage)) {
      results[index] = text;
      continue;
    }

    const cacheKey = buildCacheKey(targetLanguage, text);
    const cachedValue = translationCache.get(cacheKey);
    if (cachedValue) {
      results[index] = cachedValue;
      continue;
    }

    if (!missingValues.includes(text)) {
      missingValues.push(text);
    }
  }

  if (missingValues.length > 0) {
    const translatedValues = await translateTextsViaApi(missingValues, targetLanguage);
    const translatedMap = new Map<string, string>();

    if (translatedValues && translatedValues.length === missingValues.length) {
      for (let index = 0; index < missingValues.length; index += 1) {
        const sourceText = missingValues[index];
        const translatedText = normalizeText(translatedValues[index] || '');
        const finalText = translatedText || fallbackTranslate(sourceText, targetLanguage);
        translatedMap.set(sourceText, finalText);
        translationCache.set(buildCacheKey(targetLanguage, sourceText), finalText);
      }
    } else {
      missingValues.forEach((sourceText) => {
        const finalText = fallbackTranslate(sourceText, targetLanguage);
        translatedMap.set(sourceText, finalText);
        translationCache.set(buildCacheKey(targetLanguage, sourceText), finalText);
      });
    }

    for (let index = 0; index < normalizedValues.length; index += 1) {
      const sourceText = normalizedValues[index];
      if (!sourceText) {
        continue;
      }

      const translatedText = translatedMap.get(sourceText);
      if (translatedText) {
        results[index] = translatedText;
      }
    }
  }

  return results;
}

export async function translateTextsToEnglish(values: string[]): Promise<string[]> {
  return translateTexts(values, 'en');
}

export async function translateTextsToThai(values: string[]): Promise<string[]> {
  return translateTexts(values, 'th');
}
