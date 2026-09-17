/**
 * Search helpers for the three free stock-media libraries wired into
 * the Marketing > Library "Search Stock" tab. Each function is
 * contractually required to catch its own errors and resolve `[]`
 * rather than reject — search-stock/route.ts calls all three via
 * Promise.all and relies on one dead key/provider never failing the
 * whole search. Do not remove the internal try/catch when editing.
 *
 * Pixabay note: images may not be hotlinked per their terms ("download
 * to your server first") — import-stock/route.ts always downloads and
 * re-uploads to R2 regardless of provider, so this is handled uniformly
 * rather than per-provider.
 *
 * Unsplash note: before downloading a chosen result, import-stock must
 * call the result's `downloadLocation` URL first — this is Unsplash's
 * required "register a download" call, separate from just showing
 * search results, per their API Guidelines.
 */

export interface StockSearchResult {
  source: 'pexels' | 'pixabay' | 'unsplash'
  id: string
  type: 'image' | 'video'
  thumbnailUrl: string
  fullUrl: string
  width: number
  height: number
  durationSeconds?: number
  attribution: string
  downloadLocation?: string
}

export async function searchPexels(query: string): Promise<StockSearchResult[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return []
  try {
    const [photosRes, videosRes] = await Promise.all([
      fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`, {
        headers: { Authorization: apiKey },
      }),
      fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8`, {
        headers: { Authorization: apiKey },
      }),
    ])

    const results: StockSearchResult[] = []

    if (photosRes.ok) {
      const data = await photosRes.json()
      for (const p of data.photos ?? []) {
        results.push({
          source: 'pexels', id: String(p.id), type: 'image',
          thumbnailUrl: p.src.medium, fullUrl: p.src.large2x ?? p.src.original,
          width: p.width, height: p.height,
          attribution: `Photo by ${p.photographer} on Pexels`,
        })
      }
    }

    if (videosRes.ok) {
      const data = await videosRes.json()
      for (const v of data.videos ?? []) {
        const file = v.video_files?.find((f: any) => f.quality === 'hd') ?? v.video_files?.find((f: any) => f.quality === 'sd')
        if (!file) continue
        results.push({
          source: 'pexels', id: String(v.id), type: 'video',
          thumbnailUrl: v.image, fullUrl: file.link,
          width: v.width, height: v.height, durationSeconds: v.duration,
          attribution: `Video by ${v.user?.name ?? 'Pexels contributor'} on Pexels`,
        })
      }
    }

    return results
  } catch (err) {
    console.error('[stock-providers] Pexels search failed', err)
    return []
  }
}

export async function searchPixabay(query: string): Promise<StockSearchResult[]> {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) return []
  try {
    const [imagesRes, videosRes] = await Promise.all([
      fetch(`https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=12`),
      fetch(`https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=8`),
    ])

    const results: StockSearchResult[] = []

    if (imagesRes.ok) {
      const data = await imagesRes.json()
      for (const hit of data.hits ?? []) {
        results.push({
          source: 'pixabay', id: String(hit.id), type: 'image',
          thumbnailUrl: hit.webformatURL, fullUrl: hit.largeImageURL,
          width: hit.imageWidth, height: hit.imageHeight,
          attribution: `Photo by ${hit.user} on Pixabay`,
        })
      }
    }

    if (videosRes.ok) {
      const data = await videosRes.json()
      for (const hit of data.hits ?? []) {
        const file = hit.videos?.medium ?? hit.videos?.small
        if (!file) continue
        results.push({
          source: 'pixabay', id: String(hit.id), type: 'video',
          thumbnailUrl: file.thumbnail, fullUrl: file.url,
          width: file.width, height: file.height, durationSeconds: hit.duration,
          attribution: `Video by ${hit.user} on Pixabay`,
        })
      }
    }

    return results
  } catch (err) {
    console.error('[stock-providers] Pixabay search failed', err)
    return []
  }
}

export async function searchUnsplash(query: string): Promise<StockSearchResult[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) return []
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: any): StockSearchResult => ({
      source: 'unsplash', id: r.id, type: 'image',
      thumbnailUrl: r.urls.small, fullUrl: r.urls.regular,
      width: r.width, height: r.height,
      attribution: `Photo by ${r.user?.name ?? 'Unsplash contributor'} on Unsplash`,
      downloadLocation: r.links?.download_location,
    }))
  } catch (err) {
    console.error('[stock-providers] Unsplash search failed', err)
    return []
  }
}
