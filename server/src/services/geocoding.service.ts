import { getEffectiveConfigValue } from './config.service.js';

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(
  address1: string,
  city: string,
  province: string,
  postalCode: string,
): Promise<GeocodingResult | null> {
  const apiKey = await getEffectiveConfigValue('google_maps', 'server_api_key') || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not set, skipping geocoding');
    return null;
  }

  const addressString = `${address1}, ${postalCode} ${city}, ${province}, Italy`;
  const encodedAddress = encodeURIComponent(addressString);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    }

    console.warn(`Geocoding failed for "${addressString}": ${data.status}`);
    return null;
  } catch (err) {
    console.error('Geocoding error:', err);
    return null;
  }
}
