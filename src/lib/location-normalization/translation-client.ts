import 'server-only';

import { translateTextsToEnglish, translateTextsToThai } from '@/lib/translation-api';
import type { RawInputLanguage } from '@/lib/location-normalization/types';

const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;

interface LanguageDetectionPayload {
  data?: {
    detections?: Array<Array<{ language?: string; confidence?: number }>>;
  };
}

export class TranslationClient {
  private readonly googleTranslateApiKey: string;

  constructor(googleTranslateApiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim() || '') {
    this.googleTranslateApiKey = googleTranslateApiKey;
  }

  private inferLanguageHeuristic(text: string): RawInputLanguage {
    const normalized = text.trim();
    if (!normalized) {
      return 'unknown';
    }

    return THAI_CHAR_REGEX.test(normalized) ? 'th' : 'en';
  }

  async detectLanguage(text: string): Promise<RawInputLanguage> {
    const normalized = text.trim();
    if (!normalized) {
      return 'unknown';
    }

    if (!this.googleTranslateApiKey) {
      return this.inferLanguageHeuristic(normalized);
    }

    try {
      const body = new URLSearchParams();
      body.set('q', normalized);

      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2/detect?key=${encodeURIComponent(this.googleTranslateApiKey)}`,
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
        return this.inferLanguageHeuristic(normalized);
      }

      const payload = (await response.json()) as LanguageDetectionPayload;
      const detection = payload.data?.detections?.[0]?.[0];
      const language = (detection?.language || '').trim().toLowerCase();

      if (language.startsWith('th')) {
        return 'th';
      }

      if (language.startsWith('en')) {
        return 'en';
      }

      return this.inferLanguageHeuristic(normalized);
    } catch (error) {
      console.error('Language detection failed:', error);
      return this.inferLanguageHeuristic(normalized);
    }
  }

  async translateAddressFieldsForFallback(input: {
    address: string;
    houseNumber: string;
    district: string;
    amphoe: string;
    subdistrict: string;
    province: string;
  }): Promise<{
    en: {
      address: string;
      houseNumber: string;
      district: string;
      amphoe: string;
      subdistrict: string;
      province: string;
    };
    th: {
      address: string;
      houseNumber: string;
      district: string;
      amphoe: string;
      subdistrict: string;
      province: string;
    };
  }> {
    const values = [
      input.address,
      input.houseNumber,
      input.district,
      input.amphoe,
      input.subdistrict,
      input.province,
    ];

    const [
      addressEn,
      houseNumberEn,
      districtEn,
      amphoeEn,
      subdistrictEn,
      provinceEn,
    ] = await translateTextsToEnglish(values);

    const [
      addressTh,
      houseNumberTh,
      districtTh,
      amphoeTh,
      subdistrictTh,
      provinceTh,
    ] = await translateTextsToThai(values);

    return {
      en: {
        address: addressEn,
        houseNumber: houseNumberEn,
        district: districtEn,
        amphoe: amphoeEn,
        subdistrict: subdistrictEn,
        province: provinceEn,
      },
      th: {
        address: addressTh,
        houseNumber: houseNumberTh,
        district: districtTh,
        amphoe: amphoeTh,
        subdistrict: subdistrictTh,
        province: provinceTh,
      },
    };
  }
}
