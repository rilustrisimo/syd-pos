'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

export function DeliveryMapPicker({ onSuggest }: DeliveryMapPickerProps) {
  // Slots: React-controlled divs that act as placeholders.
  // The actual Leaflet container is an imperative DOM element moved between them.
  const inlineSlotRef = useRef<HTMLDivElement>(null)
  const expandedSlotRef = useRef<HTMLDivElement>(null)
  // The raw div that Leaflet is initialized on — never unmounted by React.
  const mapHostRef = useRef<HTMLDivElement | null>(null)

  const mapRef = useRef<any>(null)
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

  // Initialize Leaflet once store settings arrive.
  // Creates mapHostRef as an imperative element appended to the inline slot.
  useEffect(() => {
    if (!storeSettings || !inlineSlotRef.current || mapRef.current) return

    let destroyed = false

    // Create the Leaflet host element imperatively so React never unmounts it.
    const mapHostEl = document.createElement('div')
    mapHostEl.style.cssText = 'position:absolute;inset:0;'
    inlineSlotRef.current.appendChild(mapHostEl)
    mapHostRef.current = mapHostEl

    import('leaflet').then(({ default: L }) => {
      if (destroyed || !mapHostEl.isConnected) return

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
      const map = L.map(mapHostEl).setView([sLat, sLng], 14)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
      markerRef.current = null
      routeLayerRef.current = null
      mapHostEl.remove()
      mapHostRef.current = null
    }
  }, [storeSettings])

  // When isExpanded changes, physically move mapHostEl between the inline and portal slots.
  // Because mapHostEl is not managed by React, appendChild just re-parents it in the DOM
  // without destroying Leaflet's event listeners or tile layers.
  useEffect(() => {
    const el = mapHostRef.current
    if (!el) return

    const target = isExpanded ? expandedSlotRef.current : inlineSlotRef.current
    if (target && el.parentNode !== target) {
      target.appendChild(el)
    }

    document.body.style.overflow = isExpanded ? 'hidden' : ''
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 50)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
    }
  }, [isExpanded])

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

  const infoBar = loading ? (
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
  )

  return (
    <>
      {/* Inline collapsed view. The actual Leaflet host element lives in inlineSlotRef
          and gets physically moved to expandedSlotRef when isExpanded is true. */}
      <div className="space-y-2">
        <div className="relative h-52">
          <div
            ref={inlineSlotRef}
            className="absolute inset-0 rounded-xl overflow-hidden border border-slate-200"
            style={{ zIndex: 0 }}
          />
          {!isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className="absolute top-2 right-2 z-[1000] bg-white/90 hover:bg-white border border-slate-200 shadow-sm rounded-md p-1.5 transition-colors"
              title="Expand map"
              type="button"
            >
              <Maximize2 className="h-4 w-4 text-slate-600" />
            </button>
          )}
        </div>
        {!isExpanded && infoBar}
      </div>

      {/* Fullscreen portal — rendered on document.body, completely outside the dialog's
          stacking context. The Leaflet host element is moved here via appendChild. */}
      {isExpanded && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col p-3 gap-2">
          <div className="relative flex-1 min-h-0">
            <div
              ref={expandedSlotRef}
              className="absolute inset-0 rounded-xl overflow-hidden border border-slate-200"
              style={{ zIndex: 0 }}
            />
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 z-[1000] bg-white/90 hover:bg-white border border-slate-200 shadow-sm rounded-md p-1.5 transition-colors"
              title="Exit fullscreen"
              type="button"
            >
              <Minimize2 className="h-4 w-4 text-slate-600" />
            </button>
          </div>
          {infoBar}
        </div>,
        document.body
      )}
    </>
  )
}
