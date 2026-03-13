import 'server-only';

import type {
  AddressComponent,
  NormalizedLocationData,
  PlaceDetails,
  RawLocationInput,
} from '@/lib/location-normalization/types';

function normalize(value: string | null | undefined): string {
  return (value || '').trim();
}

function readComponentByTypes(
  components: AddressComponent[],
  preferredTypes: string[]
): string {
  for (const preferredType of preferredTypes) {
    const matched = components.find((component) =>
      Array.isArray(component.types) && component.types.includes(preferredType)
    );

    if (!matched) {
      continue;
    }

    const value = normalize(matched.longText || matched.shortText);
    if (value) {
      return value;
    }
  }

  return '';
}

function readCountryCode(components: AddressComponent[]): string {
  const countryComponent = components.find((component) =>
    Array.isArray(component.types) && component.types.includes('country')
  );

  return normalize(countryComponent?.shortText || countryComponent?.longText).toUpperCase();
}

function mapFromSingleLanguage(
  details: PlaceDetails,
  fallback: RawLocationInput,
  language: 'en' | 'th'
): {
  name: string;
  address: string;
  houseNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  countryCode: string;
} {
  const components = details.addressComponents;

  const houseNumber =
    readComponentByTypes(components, ['street_number']) || fallback.houseNumber.trim();

  const amphoe =
    readComponentByTypes(components, ['administrative_area_level_2', 'locality']) ||
    fallback.amphoe.trim();

  const district =
    readComponentByTypes(components, [
      'administrative_area_level_3',
      'sublocality_level_1',
      'sublocality',
    ]) ||
    fallback.district.trim() ||
    amphoe;

  const subdistrict =
    readComponentByTypes(components, [
      'administrative_area_level_4',
      'sublocality_level_2',
      'sublocality_level_1',
    ]) || fallback.subdistrict.trim() || district;

  const province =
    readComponentByTypes(components, ['administrative_area_level_1']) ||
    fallback.province.trim();

  return {
    name: normalize(details.displayName) || normalize(fallback.name),
    address: normalize(details.formattedAddress) || normalize(fallback.address),
    houseNumber,
    district,
    amphoe,
    subdistrict,
    province,
    countryCode: readCountryCode(components) || (language === 'en' ? 'TH' : ''),
  };
}

export class LocationMapper {
  mapFromPlaces(
    detailsEn: PlaceDetails,
    detailsTh: PlaceDetails,
    fallbackRaw: RawLocationInput
  ): NormalizedLocationData {
    const mappedEn = mapFromSingleLanguage(detailsEn, fallbackRaw, 'en');
    const mappedTh = mapFromSingleLanguage(detailsTh, fallbackRaw, 'th');

    const latitude = Number.isFinite(detailsEn.location?.latitude)
      ? Number(detailsEn.location?.latitude)
      : fallbackRaw.latitude;

    const longitude = Number.isFinite(detailsEn.location?.longitude)
      ? Number(detailsEn.location?.longitude)
      : fallbackRaw.longitude;

    return {
      placeId: normalize(detailsEn.id) || normalize(detailsTh.id) || null,
      nameEn: mappedEn.name || fallbackRaw.name,
      nameTh: mappedTh.name || fallbackRaw.name,
      addressEn: mappedEn.address || fallbackRaw.address,
      addressTh: mappedTh.address || fallbackRaw.address,
      houseNumber: mappedEn.houseNumber || mappedTh.houseNumber || fallbackRaw.houseNumber,
      districtEn: mappedEn.district || fallbackRaw.district,
      districtTh: mappedTh.district || fallbackRaw.district,
      amphoeEn: mappedEn.amphoe || fallbackRaw.amphoe,
      amphoeTh: mappedTh.amphoe || fallbackRaw.amphoe,
      subdistrictEn: mappedEn.subdistrict || fallbackRaw.subdistrict,
      subdistrictTh: mappedTh.subdistrict || fallbackRaw.subdistrict,
      provinceEn: mappedEn.province || fallbackRaw.province,
      provinceTh: mappedTh.province || fallbackRaw.province,
      countryCode: mappedEn.countryCode || mappedTh.countryCode || 'TH',
      latitude,
      longitude,
    };
  }
}
