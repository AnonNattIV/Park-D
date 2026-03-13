import 'server-only';

import type {
  CandidateSelection,
  PlaceCandidate,
  RawLocationInput,
} from '@/lib/location-normalization/types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function safeIncludes(haystack: string, needle: string): boolean {
  if (!haystack || !needle) {
    return false;
  }

  return haystack.includes(needle) || needle.includes(haystack);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function computeDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export class LocationResolver {
  chooseBestCandidate(
    candidates: PlaceCandidate[],
    raw: RawLocationInput
  ): CandidateSelection | null {
    if (candidates.length === 0) {
      return null;
    }

    const rawName = normalize(raw.name);
    const rawAddress = normalize(raw.address);
    const rawHouseNumber = normalize(raw.houseNumber);
    const rawDistrict = normalize(raw.district);
    const rawAmphoe = normalize(raw.amphoe);
    const rawSubdistrict = normalize(raw.subdistrict);
    const rawProvince = normalize(raw.province);

    const scored = candidates.map((candidate) => {
      const candidateName = normalize(candidate.displayName);
      const candidateAddress = normalize(candidate.formattedAddress);
      let score = 0;

      if (rawName && safeIncludes(candidateName, rawName)) {
        score += 0.35;
      }

      if (rawAddress && safeIncludes(candidateAddress, rawAddress)) {
        score += 0.2;
      }

      if (rawHouseNumber && candidateAddress.includes(rawHouseNumber)) {
        score += 0.05;
      }

      if (rawSubdistrict && candidateAddress.includes(rawSubdistrict)) {
        score += 0.1;
      }

      if (rawDistrict && candidateAddress.includes(rawDistrict)) {
        score += 0.1;
      }

      if (rawAmphoe && candidateAddress.includes(rawAmphoe)) {
        score += 0.1;
      }

      if (rawProvince && candidateAddress.includes(rawProvince)) {
        score += 0.15;
      }

      if (
        raw.latitude !== null &&
        raw.longitude !== null &&
        candidate.location
      ) {
        const distanceKm = computeDistanceKm(
          raw.latitude,
          raw.longitude,
          candidate.location.latitude,
          candidate.location.longitude
        );

        if (distanceKm <= 0.5) {
          score += 0.15;
        } else if (distanceKm <= 2) {
          score += 0.1;
        } else if (distanceKm <= 5) {
          score += 0.05;
        }
      }

      return {
        candidate,
        confidence: Math.min(Number(score.toFixed(2)), 1),
      };
    });

    scored.sort((left, right) => right.confidence - left.confidence);
    return scored[0];
  }
}
