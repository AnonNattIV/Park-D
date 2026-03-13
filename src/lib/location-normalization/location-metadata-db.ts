import 'server-only';

import type { LocationNormalizationResult } from '@/lib/location-normalization/types';

export interface LocationMetadataDbPayload {
  raw_name: string;
  raw_address: string;
  raw_house_number: string;
  raw_district: string;
  raw_amphoe: string;
  raw_subdistrict: string;
  raw_province: string;
  raw_latitude: number | null;
  raw_longitude: number | null;
  raw_input_lang: string;
  place_id: string | null;
  normalized_name_en: string;
  normalized_name_th: string;
  normalized_address_en: string;
  normalized_address_th: string;
  normalized_house_number: string;
  normalized_district_en: string;
  normalized_district_th: string;
  normalized_amphoe_en: string;
  normalized_amphoe_th: string;
  normalized_subdistrict_en: string;
  normalized_subdistrict_th: string;
  normalized_province_en: string;
  normalized_province_th: string;
  normalized_country_code: string;
  normalized_latitude: number | null;
  normalized_longitude: number | null;
  resolution_status: string;
  resolution_source: string;
  confidence_score: number;
  is_fallback_translation: number;
  display_lot_name_th: string;
  display_location_th: string;
  display_address_line_th: string;
  display_street_number_th: string;
  display_district_th: string;
  display_amphoe_th: string;
  display_subdistrict_th: string;
  display_province_th: string;
}

export function buildLocationLabel(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function buildLocationMetadataDbPayload(
  lotNameRaw: string,
  normalization: LocationNormalizationResult
): LocationMetadataDbPayload {
  const normalizedLocationTh = buildLocationLabel([
    normalization.normalized.addressTh,
    normalization.normalized.houseNumber,
    normalization.normalized.subdistrictTh,
    normalization.normalized.districtTh,
    normalization.normalized.amphoeTh,
    normalization.normalized.provinceTh,
  ]);

  return {
    raw_name: normalization.raw.name,
    raw_address: normalization.raw.address,
    raw_house_number: normalization.raw.houseNumber,
    raw_district: normalization.raw.district,
    raw_amphoe: normalization.raw.amphoe,
    raw_subdistrict: normalization.raw.subdistrict,
    raw_province: normalization.raw.province,
    raw_latitude: normalization.raw.latitude,
    raw_longitude: normalization.raw.longitude,
    raw_input_lang: normalization.raw.language,
    place_id: normalization.normalized.placeId,
    normalized_name_en: normalization.normalized.nameEn,
    normalized_name_th: normalization.normalized.nameTh,
    normalized_address_en: normalization.normalized.addressEn,
    normalized_address_th: normalization.normalized.addressTh,
    normalized_house_number: normalization.normalized.houseNumber,
    normalized_district_en: normalization.normalized.districtEn,
    normalized_district_th: normalization.normalized.districtTh,
    normalized_amphoe_en: normalization.normalized.amphoeEn,
    normalized_amphoe_th: normalization.normalized.amphoeTh,
    normalized_subdistrict_en: normalization.normalized.subdistrictEn,
    normalized_subdistrict_th: normalization.normalized.subdistrictTh,
    normalized_province_en: normalization.normalized.provinceEn,
    normalized_province_th: normalization.normalized.provinceTh,
    normalized_country_code: normalization.normalized.countryCode,
    normalized_latitude: normalization.normalized.latitude,
    normalized_longitude: normalization.normalized.longitude,
    resolution_status: normalization.meta.resolutionStatus,
    resolution_source: normalization.meta.resolutionSource,
    confidence_score: normalization.meta.confidenceScore,
    is_fallback_translation: normalization.meta.isFallbackTranslation ? 1 : 0,
    display_lot_name_th: normalization.normalized.nameTh || lotNameRaw,
    display_location_th: normalizedLocationTh || buildLocationLabel([
      normalization.raw.address,
      normalization.raw.houseNumber,
      normalization.raw.subdistrict,
      normalization.raw.district,
      normalization.raw.amphoe,
      normalization.raw.province,
    ]),
    display_address_line_th: normalization.normalized.addressTh || normalization.raw.address,
    display_street_number_th:
      normalization.normalized.houseNumber || normalization.raw.houseNumber,
    display_district_th: normalization.normalized.districtTh || normalization.raw.district,
    display_amphoe_th: normalization.normalized.amphoeTh || normalization.raw.amphoe,
    display_subdistrict_th:
      normalization.normalized.subdistrictTh || normalization.raw.subdistrict,
    display_province_th: normalization.normalized.provinceTh || normalization.raw.province,
  };
}
