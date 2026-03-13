import 'server-only';

import type {
  AddressComponent,
  PlaceCandidate,
  PlaceDetails,
  PlaceLocationPoint,
} from '@/lib/location-normalization/types';

interface GooglePlacesSearchResponse {
  places?: Array<{
    id?: string;
    name?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: AddressComponent[];
  }>;
}

interface GooglePlaceDetailsResponse {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: AddressComponent[];
}

interface SearchPlacesInput {
  query: string;
  latitude: number | null;
  longitude: number | null;
  maxResults?: number;
}

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_URL_BASE = 'https://places.googleapis.com/v1';
const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 9000;
const MAX_RETRY_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeAddressComponents(value: unknown): AddressComponent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is AddressComponent => typeof item === 'object' && item !== null)
    .map((component) => ({
      longText: typeof component.longText === 'string' ? component.longText : undefined,
      shortText: typeof component.shortText === 'string' ? component.shortText : undefined,
      types: Array.isArray(component.types)
        ? component.types.filter((type): type is string => typeof type === 'string')
        : [],
    }));
}

function normalizeLocation(value: unknown): PlaceLocationPoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const latitude = Number((value as { latitude?: unknown }).latitude);
  const longitude = Number((value as { longitude?: unknown }).longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function normalizePlaceId(idValue: string | undefined, resourceNameValue: string | undefined): string {
  const id = (idValue || '').trim();
  if (id) {
    return id;
  }

  const resourceName = (resourceNameValue || '').trim();
  if (!resourceName) {
    return '';
  }

  const segments = resourceName.split('/').map((segment) => segment.trim()).filter(Boolean);
  return segments[segments.length - 1] || '';
}

function normalizeDisplayName(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const text = (value as { text?: unknown }).text;
  return typeof text === 'string' ? text.trim() : '';
}

export class GooglePlacesClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '') {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async callPlacesApi(
    url: string,
    init: RequestInit,
    fieldMask: string
  ): Promise<Response> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...init,
          cache: 'no-store',
          signal: abortController.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
            ...(init.headers || {}),
          },
        });

        if (response.ok) {
          return response;
        }

        if (!RETRIABLE_STATUS_CODES.has(response.status) || attempt >= MAX_RETRY_ATTEMPTS) {
          return response;
        }

        await sleep(250 * attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_RETRY_ATTEMPTS) {
          break;
        }

        await sleep(250 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to call Google Places API right now');
  }

  async searchPlaces(input: SearchPlacesInput): Promise<PlaceCandidate[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const query = input.query.trim();
    if (!query) {
      return [];
    }

    const maxResults = Number.isInteger(input.maxResults) && Number(input.maxResults) > 0
      ? Math.min(Number(input.maxResults), 10)
      : 5;

    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: 'th',
      regionCode: 'TH',
      maxResultCount: maxResults,
    };

    if (input.latitude !== null && input.longitude !== null) {
      body.locationBias = {
        circle: {
          center: {
            latitude: input.latitude,
            longitude: input.longitude,
          },
          radius: 2500,
        },
      };
    }

    const response = await this.callPlacesApi(
      SEARCH_TEXT_URL,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'places.id,places.name,places.displayName,places.formattedAddress,places.location,places.addressComponents'
    );

    if (!response.ok) {
      console.error('Google Places search failed:', response.status, await response.text());
      return [];
    }

    const payload = (await response.json()) as GooglePlacesSearchResponse;
    const places = Array.isArray(payload.places) ? payload.places : [];

    return places
      .map((place) => {
        const id = normalizePlaceId(place.id, place.name);
        if (!id) {
          return null;
        }

        return {
          id,
          resourceName: typeof place.name === 'string' ? place.name.trim() : `places/${id}`,
          displayName: normalizeDisplayName(place.displayName),
          formattedAddress:
            typeof place.formattedAddress === 'string' ? place.formattedAddress.trim() : '',
          location: normalizeLocation(place.location),
          addressComponents: normalizeAddressComponents(place.addressComponents),
        } as PlaceCandidate;
      })
      .filter((place): place is PlaceCandidate => place !== null);
  }

  async getPlaceDetails(placeId: string, languageCode: 'en' | 'th'): Promise<PlaceDetails | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const normalizedPlaceId = placeId.trim();
    if (!normalizedPlaceId) {
      return null;
    }

    const resourceName = normalizedPlaceId.startsWith('places/')
      ? normalizedPlaceId
      : `places/${normalizedPlaceId}`;

    const response = await this.callPlacesApi(
      `${DETAILS_URL_BASE}/${resourceName}?languageCode=${encodeURIComponent(languageCode)}&regionCode=TH`,
      {
        method: 'GET',
      },
      'id,name,displayName,formattedAddress,location,addressComponents'
    );

    if (!response.ok) {
      console.error('Google Places details failed:', response.status, await response.text());
      return null;
    }

    const payload = (await response.json()) as GooglePlaceDetailsResponse;
    const id = normalizePlaceId(payload.id, payload.name);

    if (!id) {
      return null;
    }

    return {
      id,
      resourceName: typeof payload.name === 'string' ? payload.name.trim() : `places/${id}`,
      displayName: normalizeDisplayName(payload.displayName),
      formattedAddress:
        typeof payload.formattedAddress === 'string' ? payload.formattedAddress.trim() : '',
      location: normalizeLocation(payload.location),
      addressComponents: normalizeAddressComponents(payload.addressComponents),
    };
  }
}
