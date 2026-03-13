import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationNormalizationService } from './location-normalization-service';
import { buildLocationMetadataDbPayload } from './location-metadata-db';
import type {
  CandidateSelection,
  NormalizedLocationData,
  PlaceDetails,
  RawLocationInput,
} from './types';

class MockPlacesClient {
  public configured = true;

  public candidates: Array<{
    id: string;
    resourceName: string;
    displayName: string;
    formattedAddress: string;
    location: { latitude: number; longitude: number } | null;
    addressComponents: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  }> = [];

  public detailsEn: PlaceDetails | null = null;

  public detailsTh: PlaceDetails | null = null;

  public searchCalls: Array<{ query: string; latitude: number | null; longitude: number | null }> =
    [];

  isConfigured(): boolean {
    return this.configured;
  }

  async searchPlaces(input: {
    query: string;
    latitude: number | null;
    longitude: number | null;
    maxResults?: number;
  }) {
    this.searchCalls.push({
      query: input.query,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return this.candidates;
  }

  async getPlaceDetails(_placeId: string, languageCode: 'en' | 'th') {
    return languageCode === 'en' ? this.detailsEn : this.detailsTh;
  }
}

class MockTranslationClient {
  public detected: 'th' | 'en' | 'unknown' = 'unknown';

  public fallback = {
    en: {
      address: '',
      houseNumber: '',
      district: '',
      amphoe: '',
      subdistrict: '',
      province: '',
    },
    th: {
      address: '',
      houseNumber: '',
      district: '',
      amphoe: '',
      subdistrict: '',
      province: '',
    },
  };

  async detectLanguage(_text: string): Promise<'th' | 'en' | 'unknown'> {
    return this.detected;
  }

  async translateAddressFieldsForFallback() {
    return this.fallback;
  }
}

class MockResolver {
  public result: CandidateSelection | null = null;

  chooseBestCandidate(): CandidateSelection | null {
    return this.result;
  }
}

class MockMapper {
  public normalized: NormalizedLocationData = {
    placeId: null,
    nameEn: '',
    nameTh: '',
    addressEn: '',
    addressTh: '',
    houseNumber: '',
    districtEn: '',
    districtTh: '',
    amphoeEn: '',
    amphoeTh: '',
    subdistrictEn: '',
    subdistrictTh: '',
    provinceEn: '',
    provinceTh: '',
    countryCode: 'TH',
    latitude: null,
    longitude: null,
  };

  mapFromPlaces(): NormalizedLocationData {
    return this.normalized;
  }
}

function buildRawThaiInput(): RawLocationInput {
  return {
    name: '  ลานจอดรถสุขุมวิท  ',
    address: '  ถนนสุขุมวิท  ',
    houseNumber: '  12/7  ',
    district: '  วัฒนา  ',
    amphoe: '  วัฒนา  ',
    subdistrict: '  คลองเตยเหนือ  ',
    province: '  กรุงเทพมหานคร  ',
    latitude: 13.73,
    longitude: 100.57,
  };
}

function buildRawEnglishInput(): RawLocationInput {
  return {
    name: '  Sukhumvit Parking  ',
    address: '  Sukhumvit Road  ',
    houseNumber: '  12/7  ',
    district: '  Watthana  ',
    amphoe: '  Watthana  ',
    subdistrict: '  Khlong Toei Nuea  ',
    province: '  Bangkok  ',
    latitude: 13.73,
    longitude: 100.57,
  };
}

test('Thai raw input is preserved exactly', async () => {
  const placesClient = new MockPlacesClient();
  placesClient.configured = false;

  const translationClient = new MockTranslationClient();
  translationClient.detected = 'th';

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
  });

  const raw = buildRawThaiInput();
  const result = await service.normalize(raw);

  assert.equal(result.raw.name, raw.name);
  assert.equal(result.raw.address, raw.address);
  assert.equal(result.raw.houseNumber, raw.houseNumber);
  assert.equal(result.raw.district, raw.district);
  assert.equal(result.raw.amphoe, raw.amphoe);
  assert.equal(result.raw.subdistrict, raw.subdistrict);
  assert.equal(result.raw.province, raw.province);
  assert.equal(result.raw.language, 'th');
});

test('English raw input is preserved exactly', async () => {
  const placesClient = new MockPlacesClient();
  placesClient.configured = false;

  const translationClient = new MockTranslationClient();
  translationClient.detected = 'en';

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
  });

  const raw = buildRawEnglishInput();
  const result = await service.normalize(raw);

  assert.equal(result.raw.name, raw.name);
  assert.equal(result.raw.address, raw.address);
  assert.equal(result.raw.houseNumber, raw.houseNumber);
  assert.equal(result.raw.language, 'en');
});

test('Places normalization succeeds from Thai input', async () => {
  const placesClient = new MockPlacesClient();
  const translationClient = new MockTranslationClient();
  translationClient.detected = 'th';
  const resolver = new MockResolver();
  const mapper = new MockMapper();

  placesClient.candidates = [
    {
      id: 'abc123',
      resourceName: 'places/abc123',
      displayName: 'Sukhumvit Parking',
      formattedAddress: 'Sukhumvit Rd, Bangkok',
      location: { latitude: 13.73, longitude: 100.57 },
      addressComponents: [],
    },
  ];

  resolver.result = {
    candidate: placesClient.candidates[0],
    confidence: 0.9,
  };

  placesClient.detailsEn = {
    id: 'abc123',
    resourceName: 'places/abc123',
    displayName: 'Sukhumvit Parking',
    formattedAddress: 'Sukhumvit Rd, Bangkok, Thailand',
    location: { latitude: 13.7301, longitude: 100.5701 },
    addressComponents: [],
  };
  placesClient.detailsTh = {
    id: 'abc123',
    resourceName: 'places/abc123',
    displayName: 'ลานจอดรถสุขุมวิท',
    formattedAddress: 'ถนนสุขุมวิท กรุงเทพมหานคร ประเทศไทย',
    location: { latitude: 13.7301, longitude: 100.5701 },
    addressComponents: [],
  };

  mapper.normalized = {
    placeId: 'abc123',
    nameEn: 'Sukhumvit Parking',
    nameTh: 'ลานจอดรถสุขุมวิท',
    addressEn: 'Sukhumvit Rd, Bangkok, Thailand',
    addressTh: 'ถนนสุขุมวิท กรุงเทพมหานคร ประเทศไทย',
    houseNumber: '12/7',
    districtEn: 'Watthana',
    districtTh: 'วัฒนา',
    amphoeEn: 'Watthana',
    amphoeTh: 'วัฒนา',
    subdistrictEn: 'Khlong Toei Nuea',
    subdistrictTh: 'คลองเตยเหนือ',
    provinceEn: 'Bangkok',
    provinceTh: 'กรุงเทพมหานคร',
    countryCode: 'TH',
    latitude: 13.7301,
    longitude: 100.5701,
  };

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
    resolver,
    mapper,
  });

  const raw = buildRawThaiInput();
  const result = await service.normalize(raw);

  assert.equal(result.meta.resolutionStatus, 'resolved');
  assert.equal(result.meta.resolutionSource, 'places');
  assert.equal(result.meta.isFallbackTranslation, false);
  assert.equal(result.normalized.nameTh, 'ลานจอดรถสุขุมวิท');
  assert.equal(result.normalized.nameEn, 'Sukhumvit Parking');
  assert.equal(result.raw.name, raw.name);
  assert.equal(result.raw.address, raw.address);
});

test('Places normalization succeeds from English input', async () => {
  const placesClient = new MockPlacesClient();
  const translationClient = new MockTranslationClient();
  translationClient.detected = 'en';
  const resolver = new MockResolver();
  const mapper = new MockMapper();

  placesClient.candidates = [
    {
      id: 'p2',
      resourceName: 'places/p2',
      displayName: 'Central Parking',
      formattedAddress: 'Pathum Wan, Bangkok',
      location: { latitude: 13.745, longitude: 100.534 },
      addressComponents: [],
    },
  ];

  resolver.result = { candidate: placesClient.candidates[0], confidence: 0.8 };
  placesClient.detailsEn = {
    id: 'p2',
    resourceName: 'places/p2',
    displayName: 'Central Parking',
    formattedAddress: 'Pathum Wan, Bangkok, Thailand',
    location: { latitude: 13.745, longitude: 100.534 },
    addressComponents: [],
  };
  placesClient.detailsTh = {
    id: 'p2',
    resourceName: 'places/p2',
    displayName: 'เซ็นทรัลพาร์คกิ้ง',
    formattedAddress: 'ปทุมวัน กรุงเทพมหานคร ประเทศไทย',
    location: { latitude: 13.745, longitude: 100.534 },
    addressComponents: [],
  };

  mapper.normalized = {
    placeId: 'p2',
    nameEn: 'Central Parking',
    nameTh: 'เซ็นทรัลพาร์คกิ้ง',
    addressEn: 'Pathum Wan, Bangkok, Thailand',
    addressTh: 'ปทุมวัน กรุงเทพมหานคร ประเทศไทย',
    houseNumber: '991',
    districtEn: 'Pathum Wan',
    districtTh: 'ปทุมวัน',
    amphoeEn: 'Pathum Wan',
    amphoeTh: 'ปทุมวัน',
    subdistrictEn: 'Pathum Wan',
    subdistrictTh: 'ปทุมวัน',
    provinceEn: 'Bangkok',
    provinceTh: 'กรุงเทพมหานคร',
    countryCode: 'TH',
    latitude: 13.745,
    longitude: 100.534,
  };

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
    resolver,
    mapper,
  });

  const raw = buildRawEnglishInput();
  const result = await service.normalize(raw);

  assert.equal(result.meta.resolutionStatus, 'resolved');
  assert.equal(result.normalized.nameEn, 'Central Parking');
  assert.equal(result.normalized.nameTh, 'เซ็นทรัลพาร์คกิ้ง');
  assert.equal(result.raw.name, raw.name);
});

test('Unresolved Places result falls back to translation metadata', async () => {
  const placesClient = new MockPlacesClient();
  placesClient.candidates = [];

  const translationClient = new MockTranslationClient();
  translationClient.detected = 'th';
  translationClient.fallback = {
    en: {
      address: 'Sukhumvit Road',
      houseNumber: '12/7',
      district: 'Watthana',
      amphoe: 'Watthana',
      subdistrict: 'Khlong Toei Nuea',
      province: 'Bangkok',
    },
    th: {
      address: 'ถนนสุขุมวิท',
      houseNumber: '12/7',
      district: 'วัฒนา',
      amphoe: 'วัฒนา',
      subdistrict: 'คลองเตยเหนือ',
      province: 'กรุงเทพมหานคร',
    },
  };

  const resolver = new MockResolver();
  resolver.result = null;

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
    resolver,
  });

  const result = await service.normalize(buildRawThaiInput());

  assert.equal(result.meta.resolutionStatus, 'partial');
  assert.equal(result.meta.resolutionSource, 'translation_fallback');
  assert.equal(result.meta.isFallbackTranslation, true);
  assert.equal(result.normalized.addressEn, 'Sukhumvit Road');
  assert.equal(result.normalized.addressTh, 'ถนนสุขุมวิท');
});

test('GPS coordinates are forwarded to Places search for assisted resolution', async () => {
  const placesClient = new MockPlacesClient();
  const translationClient = new MockTranslationClient();
  const resolver = new MockResolver();

  placesClient.candidates = [
    {
      id: 'gps1',
      resourceName: 'places/gps1',
      displayName: 'GPS Parking',
      formattedAddress: 'Bangkok',
      location: { latitude: 13.73, longitude: 100.57 },
      addressComponents: [],
    },
  ];
  resolver.result = { candidate: placesClient.candidates[0], confidence: 0.7 };
  placesClient.detailsEn = {
    id: 'gps1',
    resourceName: 'places/gps1',
    displayName: 'GPS Parking',
    formattedAddress: 'Bangkok, Thailand',
    location: { latitude: 13.73, longitude: 100.57 },
    addressComponents: [],
  };
  placesClient.detailsTh = {
    id: 'gps1',
    resourceName: 'places/gps1',
    displayName: 'ที่จอดรถ GPS',
    formattedAddress: 'กรุงเทพมหานคร ประเทศไทย',
    location: { latitude: 13.73, longitude: 100.57 },
    addressComponents: [],
  };

  const mapper = new MockMapper();
  mapper.normalized = {
    placeId: 'gps1',
    nameEn: 'GPS Parking',
    nameTh: 'ที่จอดรถ GPS',
    addressEn: 'Bangkok, Thailand',
    addressTh: 'กรุงเทพมหานคร ประเทศไทย',
    houseNumber: '12/7',
    districtEn: 'Watthana',
    districtTh: 'วัฒนา',
    amphoeEn: 'Watthana',
    amphoeTh: 'วัฒนา',
    subdistrictEn: 'Khlong Toei Nuea',
    subdistrictTh: 'คลองเตยเหนือ',
    provinceEn: 'Bangkok',
    provinceTh: 'กรุงเทพมหานคร',
    countryCode: 'TH',
    latitude: 13.73,
    longitude: 100.57,
  };

  const service = new LocationNormalizationService({
    placesClient,
    translationClient,
    resolver,
    mapper,
  });

  const raw = buildRawThaiInput();
  await service.normalize(raw);

  assert.equal(placesClient.searchCalls.length, 1);
  assert.equal(placesClient.searchCalls[0].latitude, raw.latitude);
  assert.equal(placesClient.searchCalls[0].longitude, raw.longitude);
});

test('Raw and normalized fields are stored separately in metadata payload', () => {
  const payload = buildLocationMetadataDbPayload('ลานเดิม', {
    raw: {
      name: 'ลานเดิม',
      address: 'ถนนดิบ',
      houseNumber: '99',
      district: 'เขตดิบ',
      amphoe: 'อำเภอดิบ',
      subdistrict: 'ตำบลดิบ',
      province: 'จังหวัดดิบ',
      latitude: 13.7,
      longitude: 100.5,
      language: 'th',
    },
    normalized: {
      placeId: 'places/abc',
      nameEn: 'Canonical Parking',
      nameTh: 'ที่จอดรถมาตรฐาน',
      addressEn: 'Canonical Road',
      addressTh: 'ถนนมาตรฐาน',
      houseNumber: '100',
      districtEn: 'Canonical District',
      districtTh: 'เขตมาตรฐาน',
      amphoeEn: 'Canonical Amphoe',
      amphoeTh: 'อำเภอมาตรฐาน',
      subdistrictEn: 'Canonical Subdistrict',
      subdistrictTh: 'ตำบลมาตรฐาน',
      provinceEn: 'Canonical Province',
      provinceTh: 'จังหวัดมาตรฐาน',
      countryCode: 'TH',
      latitude: 13.71,
      longitude: 100.51,
    },
    meta: {
      resolutionStatus: 'resolved',
      resolutionSource: 'places',
      confidenceScore: 0.9,
      isFallbackTranslation: false,
    },
  });

  assert.equal(payload.raw_name, 'ลานเดิม');
  assert.equal(payload.normalized_name_en, 'Canonical Parking');
  assert.equal(payload.raw_address, 'ถนนดิบ');
  assert.equal(payload.normalized_address_en, 'Canonical Road');
  assert.equal(payload.raw_latitude, 13.7);
  assert.equal(payload.normalized_latitude, 13.71);
});
