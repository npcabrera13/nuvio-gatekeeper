# Nuvio Gatekeeper — Complete Project Guide

> **Read this file completely before making any changes.**
> This document is the single source of truth for the Nuvio project.
> Last updated: June 23, 2026

---

## 1. PROJECT OVERVIEW

**Nuvio** is a Philippine streaming service that bundles multiple content sources into one Stremio addon. Customers pay ₱49/month for access to Netflix movies, Prime Video, Disney+, HBO Max, Apple TV+, Crunchyroll, Hulu, Paramount+, Philippine Live TV (GMA, A2Z, PTV, etc.), and international channels (ABC News, Al Jazeera, Disney XD, Pokemon, etc.).

### Business Model
- **Price:** ₱49/month (₱1.63/day)
- **Tiers:** 30 days (₱49), 60 days (₱89), 90 days (₱129)
- **Free trial:** 7 days, no credit card, full access
- **No auto-renew:** Customers pay for a period, it expires, they renew manually
- **Target market:** Philippines, mobile-first (95% of traffic is mobile phones)
- **Payment:** PayMongo (GCash, Maya, credit card) — integration pending

### How It Works
1. Customer signs up at `nuviostreamapi.vercel.app`
2. Gets a unique addon URL like `https://nuviostreamapi.vercel.app/nuvio_XXXXXX/manifest.json`
3. Customer signs up at `nuviostreamapi.vercel.app`
4. They are given a Nuvio account that you have already pre-configured with the collections and tweaked settings
5. They log into the Nuvio app with their account, and the app automatically fetches catalogs, metadata, and streams through the Nuvio bundle
---

## 2. ARCHITECTURE — CRITICAL TO UNDERSTAND

The project has TWO completely separate parts that share the same Vercel deployment:

### Part A: The Stremio API (Backend)
- **File:** `api/proxy.js` (~760 lines)
- **Purpose:** Serves Stremio addon protocol (manifest, catalog, meta, stream, subtitles)
- **Routing:** Controlled by `vercel.json` — routes `/:token/manifest.json` etc. to `/api/proxy`
- **Database:** Firebase Firestore — validates customer tokens on stream requests
- **Current version:** 1.4.1

### Part B: The Website (Frontend)
- **Files:** `index.html`, `landing.css`, `landing.js`
- **Purpose:** Customer-facing landing page (marketing, signup, info)
- **Routing:** Vercel serves `index.html` at `/` and `admin.html` at `/admin`

### ⚠️ CRITICAL: These two parts MUST NOT interfere with each other
- The Stremio API routes (`/:token/*`) MUST always return JSON
- The website routes (`/`, `/admin`, `/login`, `/signup`) return HTML
- **NEVER touch `vercel.json`** without understanding the routing patterns
- **NEVER touch `api/proxy.js`** unless fixing a specific Stremio API issue

---

## 3. CRITICAL FILES — WHAT NOT TO TOUCH

| File | Purpose | Can modify? |
|---|---|---|
| `api/proxy.js` | Stremio API — manifest, catalogs, streams, masking | ⚠️ Only for Stremio API fixes |
| `vercel.json` | URL routing rules | ❌ NEVER touch |
| `admin.html` | Admin panel UI | ⚠️ Only for admin features |
| `admin.js` | Admin panel logic | ⚠️ Only for admin features |
| `style.css` | Admin panel styles | ⚠️ Only for admin features |
| `master-ph-v2.m3u` | Philippine TV channel playlist | ⚠️ Only for channel changes |
| `vip-cherry-pick.m3u` | VIP/international channel playlist | ⚠️ Only for channel changes |
| `package.json` | Dependencies + deploy script | ⚠️ Only for dependency changes |
| `server.js` | Local dev server | ⚠️ Rarely needed |
| `.env` | Environment variables (if exists) | ❌ NEVER touch or expose |

### Files you CAN freely modify for website work:
- `index.html` — landing page structure
- `landing.css` — landing page styles
- `landing.js` — landing page JavaScript

---

## 4. STREMIO API DETAILS (`api/proxy.js`)

### How Customer Tokens Work
- Each customer gets a token like `nuvio_2xa56et`
- The token is part of the URL: `https://nuviostreamapi.vercel.app/nuvio_2xa56et/manifest.json`
- Stremio apps use this URL to access the addon
- The bundle validates the token against Firestore on stream requests

### Routing Patterns (in `vercel.json`)
```
/manifest.json                        → /api/proxy (bundle manifest)
/:token/manifest.json                 → /api/proxy?token=:token (customer manifest)
/:token/catalog/:path*                → /api/proxy?token=:token&prefix=catalog
/:token/stream/:path*                 → /api/proxy?token=:token&prefix=stream
/:token/meta/:path*                   → /api/proxy?token=:token&prefix=meta
/:token/subtitles/:path*              → /api/proxy?token=:token&prefix=subtitles
/:token/:addon/manifest.json          → /api/proxy?token=:token&addon=:addon (single addon mode)
/:token/:addon/catalog/:path*         → /api/proxy?token=:token&addon=:addon
/:token/:addon/stream/:path*          → /api/proxy?token=:token&addon=:addon
/:token/:addon/meta/:path*            → /api/proxy?token=:token&addon=:addon
/:token/:addon/subtitles/:path*       → /api/proxy?token=:token&addon=:addon
```

**IMPORTANT:** Website routes (`/`, `/admin`, `/login`, etc.) use EXPLICIT paths. They do NOT conflict with `/:token/*` patterns because Vercel matches more specific routes first.

### Firestore Usage
- **Collection:** `customers/{token}`
- **Reads:** 1 per stream request (with 5-minute in-memory cache)
- **Writes:** 0 (admin panel writes via `admin.js`)
- **Customer TTL:** 5 minutes (`CUSTOMER_TTL = 5 * 60_000`)
- **Cost:** ~$0.006/month for 50 customers (negligible)

### Key Features in proxy.js
1. **Local M3U Parser:** Fetches `master-ph-v2.m3u` and `vip-cherry-pick.m3u` from GitHub, parses them server-side, bypasses stiptv.ddns.me entirely. 5-minute cache.
2. **Torrentio Masking:** Replaces "Torrentio" with "Nuvio Bundle" in stream names. Preserves quality info (e.g., "Nuvio Bundle\n1080p"). Does NOT add Nuvio logo image (Nuvio app doesn't render it for TV streams).
3. **Catalog Hide-List:** `HIDDEN_CATALOGS` set exists but is currently EMPTY (all 42 catalogs visible). The `isCatalogHidden()` function and manifest filter code are still there but inactive.
4. **Customer Validation:** Stream requests check Firestore for active status + expiry date. Manifest, catalog, and meta requests skip Firestore (fast-path).

### Upstream Addons (in `ALL_ADDONS` array)
- **Cinemeta** — movie/series metadata + catalogs
- **Tomatometadata** — Rotten Tomatoes catalogs
- **AnimeKitsu** — anime catalogs + metadata
- **Torrentio** — movie/series streams (P2P/torrent)
- **Open Subtitles** — subtitles
- **AioMetadata** — MDBList catalogs (Netflix, Prime, Disney+, etc.)
- **PinoyTV** — Philippine live TV (via local M3U parser, stiptv URL kept for backwards-compat)
- **VIPChannels** — International channels (via local M3U parser)

### Current Catalogs (42 total)
All 42 catalogs are currently visible in the manifest. The hide-list is empty. Customers can disable unwanted catalogs in their Stremio/Nuvio app settings.

---

## 5. CHANNEL PLAYLISTS

### `master-ph-v2.m3u` — Philippine Live TV (13 channels)
1. GMA Network HD
2. A2Z HD (Kapamilya)
3. ALLTV HD
4. PTV 4 HD
5. Bilyonario News Channel
6. CGTN News Live
7. Jeepney TV
8. Tagalized Movie Channel
9. TV Maria
10. INC TV HD
11. CLTC 36
12. Vegas Life TV
13. Mindanow Network TV

### `vip-cherry-pick.m3u` — VIP/International Channels (14 channels)
1. CBS News 24/7
2. ABC News Live
3. Al Jazeera English
4. Abante
5. Baby Shark TV
6. Tom and Jerry
7. Toon Goggles
8. LEGO Channel
9. Disney Channel
10. Disney XD
11. Pokemon
12. Crunchyroll
13. Aniplus Asia
14. Premier Sports

### M3U Format
```
#EXTINF:-1 tvg-logo="LOGO_URL" fanart="FANART_URL" group-title="GROUP", Channel Name
https://stream-url.m3u8
```

### Channel Logo URLs (verified working)
Most logos come from:
- `raw.githubusercontent.com/tv-logo/tv-logos/main/countries/philippines/`
- `raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/`
- `i.imgur.com` (some channels)
- `m.media-amazon.com` (CGTN)

**Channels without logos** (use styled text fallback):
- CLTC 36, Baby Shark TV, Tom & Jerry, Toon Goggles, LEGO Channel, CBS News 24/7, Premier Sports

### Fanart
7 channels have fanart (landscape background images):
- GMA, A2Z, ALLTV, PTV 4, INC TV, CGTN, Bilyonaryo

---

## 6. THE LANDING PAGE

### Design Philosophy
- **Mobile-first:** 95% of traffic is mobile phones. Mobile UI must be better than desktop.
- **Show, don't tell:** Use real movie posters, real channel logos, real UI mockups — NOT emoji, NOT text walls
- **Minimal text:** Let visuals communicate. No paragraphs. No countdown timers.
- **Premium feel:** Dark theme (like Netflix/Disney+), gradient accents, glass morphism
- **Above the fold:** Headline + price + CTA visible without scrolling on mobile

### Current State
- **Version:** v1.4.1 (Stremio API), landing page is at a basic state
- **Issues:** Brand logos may be broken, mobile layout needs work, hero section needs improvement
- **Stable baseline:** Commit `90dd80b1` is the last known good landing page state

### Sections (desired order)
1. **Navbar** — Logo + Login + "Get 7 Days Free" button
2. **Hero** — Left: headline + price + CTA. Right: movie backdrop carousel (or trailer)
3. **Now Streaming** — Netflix-style horizontal movie row (fetches top 20 from Cinemeta API)
4. **All 27 Channels** — Full grid with real logos
5. **The App** — 3 mockup cards showing the actual app UI
6. **Price Comparison** — Brand logos → ₱2,649/month → ₱49/month (98% savings)
7. **Pricing** — 30/60/90 day tiers
8. **Reviews** — 6 customer testimonials
9. **FAQ** — 8 expandable items
10. **Final CTA**
11. **Footer**
12. **Messenger Widget** — Floating bottom-right

### Brand Logos (verified working URLs)
**SVG format (from jsdelivr CDN — need CSS `filter: brightness(0) invert(1)` to make white):**
- Netflix: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/netflix.svg`
- Prime Video: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/primevideo.svg`
- Crunchyroll: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/crunchyroll.svg`
- Apple TV+: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/appletv.svg`
- Hulu: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/hulu.svg`
- Paramount+: `https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/paramountplus.svg`

**PNG format (from tv-logos repo — already colored):**
- Disney+: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/disney-plus-us.png`
- HBO Max: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/hbo-max-us.png`

**No logo available (use styled text):**
- Cignal TV, Sky Cable

### Price Comparison
```
Netflix ₱549 + Prime ₱149 + Disney+ ₱159 + HBO Max ₱199 + Apple TV+ ₱149 +
Crunchyroll ₱195 + Hulu ₱350 + Paramount+ ₱199 + Cignal ₱200 + Sky Cable ₱500

Total: ₱2,649/month
↓
Nuvio: ₱49/month
Save 98% (₱2,600/month)
```

### Cinemeta API (for dynamic movie data)
- **Catalog (top movies):** `https://nuviostreamapi.vercel.app/nuvio_2xa56et/catalog/movie/cinemeta___top.json`
- **Meta (for trailers):** `https://v3-cinemeta.strem.io/meta/movie/{imdbId}.json`
- **Posters:** `https://images.metahub.space/poster/medium/{imdbId}/img`
- **Backdrops:** `https://images.metahub.space/background/medium/{imdbId}/img`

### Mobile Design Requirements
- All buttons minimum 48x48px (touch-friendly)
- Body text minimum 16px (prevents iOS auto-zoom)
- No hover-only interactions (mobile has no hover)
- No horizontal scroll
- Sections stack vertically
- Font: Inter (Google Fonts)
- Colors: Dark theme (#0a0a0f background, #7c3aed purple accent, #ec4899 pink accent)

---

## 7. THE ADMIN PANEL

- **URL:** `https://nuviostreamapi.vercel.app/admin`
- **Files:** `admin.html`, `admin.js`, `style.css`
- **Purpose:** Manage customer tokens (create, block, delete, extend)
- **Authentication:** Password-protected (not Firebase Auth — simple password)
- **Features:**
  - Create new customer tokens
  - View all customers
  - Block/unblock customers
  - Set expiry dates
  - Generate addon URLs
  - PinoyTV/VIPChannels listed as separate addons

---

## 8. FIRESTORE DATABASE

### Structure
```
customers/{token}
  - status: "active" | "blocked" | "expired" | "inactive"
  - expiresAt: Timestamp
  - createdAt: Timestamp
  - email: string (future)
  - plan: string (future)
```

### Security
- Admin panel writes to Firestore via client-side Firebase SDK
- `api/proxy.js` reads from Firestore via server-side Firebase SDK
- Firebase config is hardcoded in `api/proxy.js` and `admin.js`

### Free Tier Limits
- 50,000 reads/day (free)
- 20,000 writes/day (free)
- 1 GB storage (free)
- Current usage: <1% of free tier

---

## 9. DEPLOYMENT

### How to Deploy
```bash
npm run deploy
```
This calls the Vercel deploy webhook. If it fails, use:
```bash
vercel --prod --yes
```

### Vercel Configuration
- **Project:** nuviostreamapi
- **Domain:** `nuviostreamapi.vercel.app`
- **Plan:** Hobby (free)
- **Branch:** `multiaddon` (production)
- **Function timeout:** 10 seconds (hobby plan limit)

### Vercel Limits
- 100 GB bandwidth/month (using ~1.5 GB)
- 1M function invocations/month (using ~50K)
- 100 GB-hours function execution (using ~0.5 GB-hours)

---

## 10. KNOWN ISSUES & LIMITATIONS

1. **First boot is slow** (~10-15 seconds) because Stremio fetches all 42 catalogs in parallel. Solution: implement pre-warm cache (cron job) — not yet done.
2. **AIOMetadata can be slow** — sometimes takes 5-10 seconds to respond. Vercel's 10s timeout may kill these requests.
3. **Imgur rate-limiting** — some channel logos hosted on Imgur may 429 from server-side fetches but work in browsers.
4. **No payment integration yet** — PayMongo integration is planned but not implemented.
5. **No customer auth yet** — Email/password signup and login are planned but not implemented.
6. **No anti-abuse yet** — Free trial abuse prevention (temp email blocking, fingerprinting) is planned but not implemented.
7. **4 PLDT .mpd channels** (GMA, ALLTV, PTV, INC TV) use HTTP DASH with shared credentials — may not play in all Stremio clients. Currently works in Nuvio app.

---

## 11. GIT HISTORY (key commits)

| Commit | Description |
|---|---|
| `9f4fb5fc` | Rollback to 90dd80b (stable landing page) |
| `90dd80b1` | Landing page + admin UI separation (stable baseline) |
| `8ee22181` | v1.4.0 — Remove Nuvio logo + preserve quality info |
| `5bd9c514` | Rollback to v1.3.7 (stable Stremio API) |
| `7be57bb5` | v1.3.7 — Working Collections (removed /catalog/ short-circuit) |
| `9fd18744` | Local M3U parser + fanart (major feature) |
| `6dc7d9ca` | Transparent PNG logos for 9 channels |

---

## 12. PLANNED FEATURES (not yet implemented)

### Customer Website
- [ ] Email/password signup (Firebase Auth)
- [ ] Google Sign-In option
- [ ] 7-day free trial with email verification
- [ ] Customer dashboard with countdown timer
- [ ] Addon URL + collections JSON download
- [ ] PayMongo payment integration (GCash, Maya, credit card)
- [ ] TV token login (generate code on TV, authorize on phone)

### Anti-Abuse
- [ ] Block disposable email domains
- [ ] Strip email aliases (+1, +2)
- [ ] IP rate limiting (max 3 trials per IP per 30 days)
- [ ] FingerprintJS device fingerprinting (optional)

### Performance
- [ ] Pre-warm cache (Vercel Cron job pings bundle every 50 min)
- [ ] Server-side catalog caching (1-hour TTL)
- [ ] Vercel KV for shared session tracking (if needed)

### Future
- [ ] Session limiting (5 concurrent devices per token)
- [ ] Family plan tier (more devices)
- [ ] Freebies tab
- [ ] YouTube tutorial embed
- [ ] FB Messenger support widget

---

## 13. IMPORTANT RULES FOR AI AGENTS

If you are an AI agent working on this project, follow these rules:

1. **NEVER touch `api/proxy.js`** unless explicitly fixing a Stremio API issue. The Stremio API is stable and working. Breaking it means customers lose streaming access.

2. **NEVER touch `vercel.json`** — the routing patterns are carefully configured. One wrong rewrite can break all customer tokens.

3. **ALWAYS test Stremio API after any deploy:**
   ```bash
   curl -s https://nuviostreamapi.vercel.app/nuvio_2xa56et/manifest.json | head -c 80
   ```
   Should return JSON starting with `{"id":"com.nuvio.bundle.v2"}`

4. **ALWAYS design mobile-first.** 95% of traffic is mobile. Test at 375px width (iPhone SE).

5. **NEVER use emoji as icons.** Use real brand logos, real screenshots, or styled text.

6. **NEVER use countdown timers** on the landing page. The user explicitly removed them.

7. **ALWAYS use verified working image URLs.** Test URLs with curl before adding them. Wikipedia Commons URLs frequently return 400 errors.

8. **NEVER add React, Vue, jQuery, or any JS framework.** The project uses vanilla HTML/CSS/JS only.

9. **ALWAYS keep changes small and focused.** One feature per commit. Don't redesign the entire page in one shot.

10. **The Nuvio logo is:** `https://i.ibb.co/J91qPG0/Logo-1080x1080.png` (transparent PNG, 488x536, RGBA)

---

## 14. CONTACT & SUPPORT

- **Facebook Page:** (to be added)
- **Messenger:** (to be added)
- **WhatsApp:** (to be added)
- **YouTube Tutorial:** (to be added)

---

*This document is maintained manually. Update it when significant changes are made to the project.*
