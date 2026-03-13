import 'server-only';

import { GooglePlacesClient } from '@/lib/location-normalization/google-places-client';
import { LocationMapper } from '@/lib/location-normalization/location-mapper';
import { LocationResolver } from '@/lib/location-normalization/location-resolver';
import { TranslationClient } from '@/lib/location-normalization/translation-client';
import type {
  CandidateSelection,
  LocationNormalizationResult,
  NormalizedLocationData,
  PlaceDetails,
  RawLocationInput,
} from '@/lib/location-normalization/types';

interface PlacesClientContract {
  isConfigured(): boolean;
  searchPlaces(input: {
    query: string;
    latitude: number | null;
    longitude: number | null;
    maxResults?: number;
  }): Promise<Array<{
    id: string;
    resourceName: string;
    displayName: string;
    formattedAddress: string;
    location: { latitude: number; longitude: number } | null;
    addressComponents: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  }>>;
  getPlaceDetails(placeId: string, languageCode: 'en' | 'th'): Promise<PlaceDetails | null>;
}

interface TranslationClientContract {
  detectLanguage(text: string): Promise<'th' | 'en' | 'unknown'>;
  translateAddressFieldsForFallback(input: {
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
  }>;
}

interface ResolverContract {
  chooseBestCandidate(candidates: any[], raw: RawLocationInput): CandidateSelection | null;
}

interface MapperContract {
  mapFromPlaces(detailsEn: PlaceDetails, detailsTh: PlaceDetails, fallbackRaw: RawLocationInput): NormalizedLocationData;
}

interface LocationNormalizationDependencies {
  placesClient?: PlacesClientContract;
  translationClient?: TranslationClientContract;
  resolver?: ResolverContract;
  mapper?: MapperContract;
}

const RESOLVED_CONFIDENCE_THRESHOLD = 0.55;
const PARTIAL_CONFIDENCE_THRESHOLD = 0.35;

function normalizeRawInput(raw: RawLocationInput): RawLocationInput {
  return {
    name: raw.name,
    address: raw.address,
    houseNumber: raw.houseNumber,
    district: raw.district,
    amphoe: raw.amphoe,
    subdistrict: raw.subdistrict,
    province: raw.province,
    latitude: raw.latitude,
    longitude: raw.longitude,
    language: raw.language,
  };
}

function buildSearchQuery(raw: RawLocationInput): string {
  const segments = [
    raw.name,
    raw.address,
    raw.houseNumber,
    raw.subdistrict,
    raw.district,
    raw.amphoe,
    raw.province,
    'Thailand',
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return segments.join(', ');
}

function buildBaseFallbackNormalized(raw: RawLocationInput): NormalizedLocationData {
  return {
    placeId: null,
    nameEn: raw.name,
    nameTh: raw.name,
    addressEn: raw.address,
    addressTh: raw.address,
    houseNumber: raw.houseNumber,
    districtEn: raw.district,
    districtTh: raw.district,
    amphoeEn: raw.amphoe,
    amphoeTh: raw.amphoe,
    subdistrictEn: raw.subdistrict,
    subdistrictTh: raw.subdistrict,
    provinceEn: raw.province,
    provinceTh: raw.province,
    countryCode: 'TH',
    latitude: raw.latitude,
    longitude: raw.longitude,
  };
}

export class LocationNormalizationService {
  private readonly placesClient: PlacesClientContract;

  private readonly translationClient: TranslationClientContract;

  private readonly resolver: ResolverContract;

  private readonly mapper: MapperContract;

  constructor(dependencies: LocationNormalizationDependencies = {}) {
    this.placesClient = dependencies.placesClient || new GooglePlacesClient();
    this.translationClient = dependencies.translationClient || new TranslationClient();
    this.resolver = dependencies.resolver || new LocationResolver();
    this.mapper = dependencies.mapper || new LocationMapper();
  }

  async normalize(rawInput: RawLocationInput): Promise<LocationNormalizationResult> {
    const raw = normalizeRawInput(rawInput);
    const detectedLanguage = raw.language || (await this.translationClient.detectLanguage([
      raw.name,
      raw.address,
      raw.province,
    ].filter(Boolean).join(' ')));

    raw.language = detectedLanguage;

    const baseFallback = buildBaseFallbackNormalized(raw);
    const query = buildSearchQuery(raw);

    if (!this.placesClient.isConfigured() || !query) {
      return {
        raw: {
          ...raw,
          language: raw.language || 'unknown',
        },
        normalized: baseFallback,
        meta: {
          resolutionStatus: 'unresolved',
          resolutionSource: 'none',
          confidenceScore: 0,
          isFallbackTranslation: false,
        },
      };
    }

    try {
      const candidates = await this.placesClient.searchPlaces({
        query,
        latitude: raw.latitude,
        longitude: raw.longitude,
        maxResults: 5,
      });

      const bestCandidate = this.resolver.chooseBestCandidate(candidates, raw);
      if (!bestCandidate) {
        return await this.normalizeWithFallback(raw, baseFallback, 0);
      }

      const detailsEn = await this.placesClient.getPlaceDetails(bestCandidate.candidate.id, 'en');
      const detailsTh = await this.placesClient.getPlaceDetails(bestCandidate.candidate.id, 'th');

      if (!detailsEn || !detailsTh) {
        return await this.normalizeWithFallback(raw, baseFallback, bestCandidate.confidence);
      }

      const normalized = this.mapper.mapFromPlaces(detailsEn, detailsTh, raw);
      const confidenceScore = Math.min(Math.max(bestCandidate.confidence, 0), 1);
      const resolutionStatus =
        confidenceScore >= RESOLVED_CONFIDENCE_THRESHOLD
          ? 'resolved'
          : confidenceScore >= PARTIAL_CONFIDENCE_THRESHOLD
            ? 'partial'
            : 'unresolved';

      if (resolutionStatus === 'unresolved') {
        return await this.normalizeWithFallback(raw, baseFallback, confidenceScore);
      }

      return {
        raw: {
          ...raw,
          language: raw.language || 'unknown',
        },
        normalized,
        meta: {
          resolutionStatus,
          resolutionSource: 'places',
          confidenceScore,
          isFallbackTranslation: false,
        },
      };
    } catch (error) {
      console.error('Location normalization via Places failed:', error);
      return await this.normalizeWithFallback(raw, baseFallback, 0);
    }
  }

  private async normalizeWithFallback(
    raw: RawLocationInput,
    baseFallback: NormalizedLocationData,
    inheritedConfidence: number
  ): Promise<LocationNormalizationResult> {
    try {
      const fallbackTranslations = await this.translationClient.translateAddressFieldsForFallback({
        address: raw.address,
        houseNumber: raw.houseNumber,
        district: raw.district,
        amphoe: raw.amphoe,
        subdistrict: raw.subdistrict,
        province: raw.province,
      });

      const normalized: NormalizedLocationData = {
        ...baseFallback,
        addressEn: fallbackTranslations.en.address || baseFallback.addressEn,
        addressTh: fallbackTranslations.th.address || baseFallback.addressTh,
        houseNumber: fallbackTranslations.en.houseNumber || fallbackTranslations.th.houseNumber || baseFallback.houseNumber,
        districtEn: fallbackTranslations.en.district || baseFallback.districtEn,
        districtTh: fallbackTranslations.th.district || baseFallback.districtTh,
        amphoeEn: fallbackTranslations.en.amphoe || baseFallback.amphoeEn,
        amphoeTh: fallbackTranslations.th.amphoe || baseFallback.amphoeTh,
        subdistrictEn: fallbackTranslations.en.subdistrict || baseFallback.subdistrictEn,
        subdistrictTh: fallbackTranslations.th.subdistrict || baseFallback.subdistrictTh,
        provinceEn: fallbackTranslations.en.province || baseFallback.provinceEn,
        provinceTh: fallbackTranslations.th.province || baseFallback.provinceTh,
      };

      const hasUsefulFallback = Boolean(
        normalized.addressEn ||
          normalized.addressTh ||
          normalized.provinceEn ||
          normalized.provinceTh
      );

      return {
        raw: {
          ...raw,
          language: raw.language || 'unknown',
        },
        normalized,
        meta: {
          resolutionStatus: hasUsefulFallback ? 'partial' : 'unresolved',
          resolutionSource: hasUsefulFallback ? 'translation_fallback' : 'none',
          confidenceScore: hasUsefulFallback
            ? Math.max(inheritedConfidence, 0.25)
            : Math.max(inheritedConfidence, 0),
          isFallbackTranslation: hasUsefulFallback,
        },
      };
    } catch (error) {
      console.error('Location fallback normalization failed:', error);
      return {
        raw: {
          ...raw,
          language: raw.language || 'unknown',
        },
        normalized: baseFallback,
        meta: {
          resolutionStatus: inheritedConfidence >= PARTIAL_CONFIDENCE_THRESHOLD ? 'partial' : 'unresolved',
          resolutionSource: 'none',
          confidenceScore: Math.max(inheritedConfidence, 0),
          isFallbackTranslation: false,
        },
      };
    }
  }
}
