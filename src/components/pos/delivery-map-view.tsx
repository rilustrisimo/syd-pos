'use client'

import { useEffect, useRef, useState } from 'react'
import { getClient } from '@/lib/supabase/client'
import { getRoadDistance } from '@/lib/routing'
import 'leaflet/dist/leaflet.css'

interface DeliveryMapViewProps {
  lat: number
  lng: number
  distanceKm?: number | null
  geocodedAddress?: string | null
  roadBased?: boolean | null
}

export function DeliveryMapView({ lat, lng, distanceKm, geocodedAddress, roadBased }: DeliveryMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [storeName, setStoreName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const supabase = getClient()
    let destroyed = false

    ;(async () => {
      try {
        const { data } = await supabase
          .from('shop_settings')
          .select('store_latitude,store_longitude,store_name')
          .limit(1)
          .single()

        if (destroyed || !data || !containerRef.current) return
        setStoreName(data.store_name ?? null)

        const { default: L } = await import('leaflet')
        if (destroyed || !containerRef.current) return

        const customerIcon = L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        })

        const storeIcon = L.divIcon({
          className: '',
          html: '<div style="background:#ffc107;width:16px;height:16px;border-radius:50%;border:2.5px solid #0f172a;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })

        const sLat = data.store_latitude
        const sLng = data.store_longitude

        const map = L.map(containerRef.current!, { zoomControl: true, dragging: true, scrollWheelZoom: false })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        L.marker([sLat, sLng], { icon: storeIcon, interactive: false })
          .bindTooltip('Store', { permanent: false, direction: 'top' })
          .addTo(map)

        L.marker([lat, lng], { icon: customerIcon, interactive: false })
          .bindTooltip('Delivery location', { permanent: false, direction: 'top' })
          .addTo(map)

        map.fitBounds(L.latLngBounds([[sLat, sLng], [lat, lng]]), { padding: [40, 40] })
        mapRef.current = map

        // Attempt to draw the route polyline from OSRM (best-effort, falls back silently)
        try {
          const route = await getRoadDistance(sLat, sLng, lat, lng)
          if (destroyed || !route.routeCoords || route.routeCoords.length < 2) return
          L.polyline(route.routeCoords, { color: '#ffffff', weight: 9, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }).addTo(map)
          L.polyline(route.routeCoords, { color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(map)
          map.fitBounds(L.latLngBounds(route.routeCoords), { padding: [40, 40] })
        } catch {
          // Silently fall back to the two-point view already rendered
        }
      } catch {
        if (!destroyed) setLoadError(true)
      }
    })()

    return () => {
      destroyed = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [lat, lng])

  if (loadError) {
    return (
      <p className="text-xs text-muted-foreground">Map unavailable — store settings not configured.</p>
    )
  }

  return (
    <div className="space-y-2 mt-2">
      <div
        ref={containerRef}
        className="w-full h-48 rounded-lg overflow-hidden border border-slate-200"
        style={{ zIndex: 0 }}
      />
      <div className="text-xs text-slate-600 space-y-0.5">
        {distanceKm != null && (
          <p>
            <span className="font-medium">{distanceKm} km</span> from store
            {' · '}
            <span className="text-slate-400">
              {roadBased ? '🛣️ road distance' : '📏 straight-line estimate'}
            </span>
          </p>
        )}
        {geocodedAddress && (
          <p className="text-slate-500">📌 Near: {geocodedAddress}</p>
        )}
        <p className="text-slate-400 font-mono text-[10px]">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
      </div>
    </div>
  )
}
