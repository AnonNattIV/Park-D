export function buildGoogleMapsEmbedUrl(
  latitude: number | null,
  longitude: number | null,
  zoom = 16
): string | null {
  if (latitude === null || longitude === null) {
    return null;
  }

  return `https://maps.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}&z=${zoom}&output=embed`;
}

export function buildGoogleMapsOpenUrl(
  latitude: number | null,
  longitude: number | null
): string | null {
  if (latitude === null || longitude === null) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

