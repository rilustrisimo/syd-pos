// OSRM road-based distance routing with Haversine fallback.
// Uses OpenStreetMap road network via the public OSRM demo server.
// Coordinate convention: OSRM takes lon,lat (GeoJSON); Leaflet uses lat,lng.

const OSRM = 'https://router.project-osrm.org/route/v1/driving'

export interface RouteResult {
  distance_km: number
  road_based: boolean
  routeCoords?: [number, number][]  // [lat, lng] pairs for Leaflet polyline
}

export interface FeeSettings {
  cod_radius_km: number
  delivery_fee_flat: number
  delivery_fee_per_km: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export function calcDeliveryFee(distance_km: number, settings: FeeSettings): number {
  const within_radius = distance_km <= settings.cod_radius_km
  return within_radius
    ? settings.delivery_fee_flat
    : Math.round(settings.delivery_fee_per_km * distance_km)
}

/**
 * Reverse-geocode a lat/lng to a rough address using Nominatim (OpenStreetMap).
 * Returns a short string like "Brgy. Poblacion, Talakag, Bukidnon" suitable for
 * printing on a thermal receipt. Returns null on any error.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'SYD-POS/1.0 (Construction Supplies POS)' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}

    // Build a short locality string: barangay/village + municipality + province
    const parts: string[] = []
    const locality = a.village || a.hamlet || a.suburb || a.neighbourhood
    if (locality) parts.push(locality)
    const muni = a.city || a.town || a.municipality || a.county
    if (muni && muni !== locality) parts.push(muni)
    const province = a.state
    if (province && province !== muni) parts.push(province)

    return parts.length > 0 ? parts.join(', ') : (data.display_name?.split(',').slice(0, 3).join(',').trim() ?? null)
  } catch {
    return null
  }
}

/**
 * Fetch road driving distance between two points via OSRM.
 * Returns routeCoords (lat/lng pairs) for drawing on a Leaflet map.
 * Falls back to straight-line Haversine on network error or no route.
 * Pass an AbortSignal to cancel stale requests when the pin moves.
 */
export async function getRoadDistance(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  signal?: AbortSignal
): Promise<RouteResult> {
  try {
    const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=false`
    const res = await fetch(url, { signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route')

    const route = data.routes[0]
    const km = Math.round((route.distance / 1000) * 10) / 10
    const routeCoords: [number, number][] = (route.geometry?.coordinates ?? []).map(
      ([lng, lat]: [number, number]) => [lat, lng]
    )
    return { distance_km: km, road_based: true, routeCoords }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err
    const km = Math.round(haversineKm(fromLat, fromLng, toLat, toLng) * 10) / 10
    return { distance_km: km, road_based: false }
  }
}
