'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, Search, X, Loader2, MapPin } from 'lucide-react'
import { getClient } from '@/lib/supabase/client'
import { getRoadDistance, calcDeliveryFee, reverseGeocode, searchPlaces } from '@/lib/routing'
import type { FeeSettings, PlaceResult } from '@/lib/routing'
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
  /** Restore a previously-pinned location when the component remounts */
  initialCoords?: { lat: number; lng: number } | null
  /** Start in expanded state (used to preserve state across remounts) */
  initialExpanded?: boolean
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

export function DeliveryMapPicker({ onSuggest, onExpandChange, initialCoords, initialExpanded = false }: DeliveryMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapSectionRef = useRef<HTMLDivElement>(null)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const routeLayerRef = useRef<{ remove: () => void } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handlePinRef = useRef<((lat: number, lng: number) => void) | null>(null)
  const onSuggestRef = useRef(onSuggest)
  onSuggestRef.current = onSuggest

  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Close the results dropdown on outside click/tap (not input blur — blur
  // can fire and unmount the dropdown before a touch tap's click lands).
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  // Debounced place search
  useEffect(() => {
    if (query.trim().length < 3) {
      setSearchResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      searchPlaces(query, ctrl.signal)
        .then(r => { setSearchResults(r); setSearching(false) })
        .catch(() => setSearching(false))
    }, 450)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  function selectSearchResult(result: PlaceResult) {
    handlePinRef.current?.(result.lat, result.lng)
    mapRef.current?.flyTo([result.lat, result.lng], 16, { duration: 1 })
    setQuery(result.label)
    setShowResults(false)
    setSearchResults([])
  }

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

      handlePinRef.current = handlePin

      map.on('click', (e: any) => handlePin(e.latlng.lat, e.latlng.lng))

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { if (!destroyed) map.setView([pos.coords.latitude, pos.coords.longitude], 15) },
          () => {}
        )
      }

      mapRef.current = map

      // Restore previously-pinned location (e.g. after expand/collapse remount)
      if (initialCoords?.lat && initialCoords?.lng) {
        handlePin(initialCoords.lat, initialCoords.lng)
      }
    })

    return () => {
      destroyed = true
      abortRef.current?.abort()
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      routeLayerRef.current = null
      handlePinRef.current = null
    }
  }, [storeSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // When expanded, scroll the map section into view so the map + info bar
  // are visible without the user having to manually scroll the dialog.
  useEffect(() => {
    if (isExpanded) {
      const t = setTimeout(() => {
        mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return () => clearTimeout(t)
    }
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
    <div ref={mapSectionRef} className="space-y-2">
      {/* Place search */}
      <div className="relative" ref={searchWrapperRef}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            placeholder="Search for a place or landmark..."
            className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setSearchResults([]) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {showResults && searchResults.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectSearchResult(r)}
                className="w-full flex items-start gap-2 text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-slate-700 leading-snug">{r.label}</span>
              </button>
            ))}
          </div>
        )}

        {showResults && !searching && query.trim().length >= 3 && searchResults.length === 0 && (
          <div className="absolute z-[1000] mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg px-3 py-2 text-xs text-slate-400">
            No places found — try a different search, or tap the map directly.
          </div>
        )}
      </div>

      {/* containerRef is always unconditionally rendered so Leaflet stays mounted */}
      <div className="relative">
        <div
          ref={containerRef}
          className={`w-full rounded-xl overflow-hidden border border-slate-200 ${isExpanded ? 'h-[65vh]' : 'h-52'}`}
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
