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
