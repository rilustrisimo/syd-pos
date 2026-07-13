'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { getClient } from '@/lib/supabase/client'
import { getRoadDistance, calcDeliveryFee, reverseGeocode } from '@/lib/routing'
import type { FeeSettings } from '@/lib/routing'
import 'leaflet/dist/leaflet.css'

export interface MapSuggestResult {
  lat: number
  lng: number
  distanceKm: number
  fee: number
  roadBased: boolean
  geocodedAddress: string | null
}

interface DeliveryMapPickerProps {
  onSuggest: (result: MapSuggestResult | null) => void
  onExpandChange?: (expanded: boolean) => void
}

interface StoreSettings extends FeeSettings {
  store_latitude: number
  store_longitude: number
}

interface RouteInfo {
  distanceKm: number
  fee: number
  roadBased: boolean
  geocodedAddress: string | null
}

export function DeliveryMapPicker({ onSuggest, onExpandChange }: DeliveryMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const routeLayerRef = useRef<{ remove: () => void } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onSuggestRef = useRef(onSuggest)
  onSuggestRef.current = onSuggest

  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  // Fetch store coordinates + fee settings once
  useEffect(() => {
    const supabase = getClient()
    supabase
      .from('shop_settings')
      .select('store_latitude,store_longitude,cod_radius_km,delivery_fee_flat,delivery_fee_per_km')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setStoreSettings(data as StoreSettings)
        setSettingsLoading(false)
      })
  }, [])

  // Initialize Leaflet map once store settings are available
  useEffect(() => {
    if (!storeSettings || !containerRef.current || mapRef.current) return

    let destroyed = false

    import('leaflet').then(({ default: L }) => {
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

      const { store_latitude: sLat, store_longitude: sLng } = storeSettings
      const map = L.map(containerRef.current!).setView([sLat, sLng], 14)

      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      L.marker([sLat, sLng], { icon: storeIcon, interactive: false })
        .bindTooltip('Store', { permanent: false, direction: 'top' })
        .addTo(map)

      async function handlePin(lat: number, lng: number) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon: customerIcon, draggable: true }).addTo(map)
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current!.getLatLng()
            handlePin(pos.lat, pos.lng)
          })
        }

        abortRef.current?.abort()
        const ctrl = new AbortController()
        abortRef.current = ctrl
        setLoading(true)

        try {
          const [osrm, geocoded] = await Promise.all([
            getRoadDistance(sLat, sLng, lat, lng, ctrl.signal),
            reverseGeocode(lat, lng, ctrl.signal),
          ])

          if (routeLayerRef.current) {
            routeLayerRef.current.remove()
            routeLayerRef.current = null
          }
          if (osrm.routeCoords && osrm.routeCoords.length >= 2) {
            const shadow = L.polyline(osrm.routeCoords, { color: '#ffffff', weight: 9, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }).addTo(map)
            const line   = L.polyline(osrm.routeCoords, { color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(map)
            routeLayerRef.current = { remove: () => { shadow.remove(); line.remove() } }
            map.fitBounds(L.latLngBounds(osrm.routeCoords), { padding: [48, 48] })
          }

          const fee = calcDeliveryFee(osrm.distance_km, storeSettings!)
          const info: RouteInfo = {
            distanceKm: osrm.distance_km,
            fee,
            roadBased: osrm.road_based,
            geocodedAddress: geocoded,
          }
          setRouteInfo(info)
          setLoading(false)
          onSuggestRef.current({ lat, lng, ...info })
        } catch (err: any) {
          if (err?.name !== 'AbortError') setLoading(false)
        }
      }

      map.on('click', (e: any) => handlePin(e.latlng.lat, e.latlng.lng))

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { if (!destroyed) map.setView([pos.coords.latitude, pos.coords.longitude], 15) },
          () => {}
        )
      }

      mapRef.current = map
    })

    return () => {
      destroyed = true
      abortRef.current?.abort()
      mapRef.current?.remove()
      mapRef.current = null
      tileLayerRef.current = null
      markerRef.current = null
      routeLayerRef.current = null
    }
  }, [storeSettings])

  // When isExpanded changes: wait one frame for the DOM to apply the new
  // height, invalidate Leaflet's size, then remove and re-add the tile layer.
  // redraw() alone is unreliable here; removing + re-adding the layer forces
  // Leaflet to fully re-initialize tile loading for the new container size.
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current
      const tl = tileLayerRef.current
      if (!map || !tl) return
      map.invalidateSize({ animate: false })
      map.removeLayer(tl)
      map.addLayer(tl)
    }, 50)
    return () => clearTimeout(t)
  }, [isExpanded])

  const handleToggleExpand = () => {
    const next = !isExpanded
    setIsExpanded(next)
    onExpandChange?.(next)
  }

  if (settingsLoading) {
    return (
      <div className="w-full h-48 rounded-xl bg-slate-100 animate-pulse border border-slate-200 flex items-center justify-center">
        <p className="text-xs text-slate-400">Loading map…</p>
      </div>
    )
  }

  if (!storeSettings) {
    return (
      <div className="w-full rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
        Map unavailable — shop settings not configured (store coordinates missing).
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* containerRef is always rendered unconditionally — Leaflet stays mounted */}
      <div className="relative">
        <div
          ref={containerRef}
          className={`w-full rounded-xl overflow-hidden border border-slate-200 ${isExpanded ? 'h-[55vh]' : 'h-52'}`}
          style={{ zIndex: 0 }}
        />
        <button
          onClick={handleToggleExpand}
          className="absolute top-2 right-2 z-[1000] bg-white/90 hover:bg-white border border-slate-200 shadow-sm rounded-md p-1.5 transition-colors"
          title={isExpanded ? 'Collapse map' : 'Expand map'}
          type="button"
        >
          {isExpanded
            ? <Minimize2 className="h-4 w-4 text-slate-600" />
            : <Maximize2 className="h-4 w-4 text-slate-600" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-slate-50 border border-slate-200 text-xs text-slate-500 animate-pulse">
          <span>📍</span>
          <span>Calculating route and address…</span>
        </div>
      ) : routeInfo ? (
        <div className={`rounded-lg px-3 py-2.5 text-xs space-y-1 ${routeInfo.distanceKm <= storeSettings.cod_radius_km ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
          <div className="flex items-center gap-1.5 font-medium">
            <span>📍</span>
            <span>
              <strong>{routeInfo.distanceKm} km</strong> from store
              {' · '}Suggested fee: <strong>₱{routeInfo.fee.toLocaleString('en-PH')}</strong>
            </span>
          </div>
          <p className="opacity-60 pl-5 leading-tight">
            {routeInfo.roadBased ? '🛣️ Road distance via OpenStreetMap' : '📏 Straight-line estimate (no road data)'}
          </p>
          {routeInfo.geocodedAddress && (
            <p className="pl-5 leading-tight font-medium">
              📌 Near: {routeInfo.geocodedAddress}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-1">Click on the map to pin the customer&apos;s delivery location</p>
      )}
    </div>
  )
}
