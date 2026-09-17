/**
 * JSX layouts rendered via next/og's ImageResponse (Satori) into branded
 * PNG creatives for the Marketing > Feed page. Satori only supports
 * flexbox layouts and a subset of CSS — see
 * https://github.com/vercel/satori#css — so these stay simple by design.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type CreativeTemplate = 'new-arrival' | 'promo' | 'spotlight'

export const CREATIVE_SIZE = { width: 1080, height: 1080 }

export interface CreativeData {
  photoUrl: string | null
  productName: string | null
  price: number | null
  notes: string | null
}

const BRAND_YELLOW = '#ffc107'
const BRAND_DARK = '#1e293b'

let logoDataUriPromise: Promise<string> | null = null
function getLogoDataUri(): Promise<string> {
  if (!logoDataUriPromise) {
    logoDataUriPromise = readFile(join(process.cwd(), 'public', 'syd-logo-mark.png'))
      .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
  }
  return logoDataUriPromise
}

// "PHP" rather than "₱" — Satori's default font has no glyph for the peso
// sign, which renders as a missing-character box instead of failing loudly.
function formatPrice(price: number): string {
  return `PHP ${price.toLocaleString('en-PH')}`
}

async function newArrivalTemplate({ photoUrl, productName, price }: CreativeData) {
  const logo = await getLogoDataUri()
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
      <div style={{ flex: 1, display: 'flex', position: 'relative', backgroundColor: '#f1f5f9' }}>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: '10px 18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={140} height={60} />
        </div>
        <div style={{ position: 'absolute', top: 32, right: 32, display: 'flex', backgroundColor: BRAND_YELLOW, color: BRAND_DARK, fontWeight: 700, fontSize: 28, borderRadius: 999, padding: '10px 28px' }}>
          NEW ARRIVAL
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '36px 44px', backgroundColor: BRAND_DARK, gap: 10 }}>
        <div style={{ display: 'flex', color: 'white', fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>
          {productName ?? 'New at SYD Construction Supplies'}
        </div>
        {price != null && (
          <div style={{ display: 'flex', color: BRAND_YELLOW, fontSize: 38, fontWeight: 700 }}>
            {formatPrice(price)}
          </div>
        )}
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: 24 }}>Visit us or order online at sydconstruct.com</div>
      </div>
    </div>
  )
}

async function promoTemplate({ photoUrl, productName, price, notes }: CreativeData) {
  const logo = await getLogoDataUri()
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: BRAND_DARK, position: 'relative' }}>
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: '10px 18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={140} height={60} />
        </div>
        <div style={{ position: 'absolute', top: 0, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 200, height: 200, backgroundColor: '#dc2626', borderRadius: '50%', color: 'white', fontWeight: 700, fontSize: 34, transform: 'rotate(8deg)' }}>
          SALE
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '36px 44px', gap: 10 }}>
        <div style={{ display: 'flex', color: 'white', fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>
          {productName ?? notes ?? 'Special offer at SYD Construction Supplies'}
        </div>
        {price != null && (
          <div style={{ display: 'flex', color: BRAND_YELLOW, fontSize: 46, fontWeight: 700 }}>
            {formatPrice(price)}
          </div>
        )}
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: 24 }}>Message us to order — sydconstruct.com</div>
      </div>
    </div>
  )
}

async function spotlightTemplate({ photoUrl, productName, notes }: CreativeData) {
  const logo = await getLogoDataUri()
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
      <div style={{ flex: 1, display: 'flex', position: 'relative', backgroundColor: '#f1f5f9' }}>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: '10px 18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={140} height={60} />
        </div>
      </div>
      {(productName || notes) && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '28px 44px', backgroundColor: '#ffffff', gap: 4 }}>
          <div style={{ display: 'flex', color: BRAND_DARK, fontSize: 32, fontWeight: 700 }}>
            {productName ?? notes}
          </div>
        </div>
      )}
    </div>
  )
}

export async function renderCreative(template: CreativeTemplate, data: CreativeData) {
  if (template === 'promo') return promoTemplate(data)
  if (template === 'spotlight') return spotlightTemplate(data)
  return newArrivalTemplate(data)
}
