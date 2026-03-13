import 'server-only';

export type RawInputLanguage = 'th' | 'en' | 'unknown';
export type ResolutionStatus = 'resolved' | 'partial' | 'unresolved';
export type ResolutionSource = 'places' | 'translation_fallback' | 'none';

export interface RawLocationInput {
  name: string;
  address: string;
  houseNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  language?: RawInputLanguage;
}

export interface NormalizedLocationData {
  placeId: string | null;
  nameEn: string;
  nameTh: string;
  addressEn: string;
  addressTh: string;
  houseNumber: string;
  districtEn: string;
  districtTh: string;
  amphoeEn: string;
  amphoeTh: string;
  subdistrictEn: string;
  subdistrictTh: string;
  provinceEn: string;
  provinceTh: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface LocationNormalizationMeta {
  resolutionStatus: ResolutionStatus;
  resolutionSource: ResolutionSource;
  confidenceScore: number;
  isFallbackTranslation: boolean;
}

export interface LocationNormalizationResult {
  raw: RawLocationInput & {
    language: RawInputLanguage;
  };
  normalized: NormalizedLocationData;
  meta: LocationNormalizationMeta;
}

export interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface PlaceLocationPoint {
  latitude: number;
  longitude: number;
}

export interface PlaceCandidate {
  id: string;
  resourceName: string;
  displayName: string;
  formattedAddress: string;
  location: PlaceLocationPoint | null;
  addressComponents: AddressComponent[];
}

export interface PlaceDetails {
  id: string;
  resourceName: string;
  displayName: string;
  formattedAddress: string;
  location: PlaceLocationPoint | null;
  addressComponents: AddressComponent[];
}

export interface CandidateSelection {
  candidate: PlaceCandidate;
  confidence: number;
}
