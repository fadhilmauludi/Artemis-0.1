# Artemis — Satellite Fire Intelligence

> **NASA Space Apps Challenge 2026 prototype**
>
> A location-aware wildfire intelligence dashboard that combines live satellite hotspots, fire-weather context, wildfire reports, and direct relief access.

## Overview

Artemis helps users move from **detection** to **context** and then to **response**:

1. View current-day active-fire observations from NASA FIRMS.
2. Compare MODIS with a combined VIIRS layer from NOAA-21 and Suomi NPP.
3. Select a hotspot to inspect local weather conditions.
4. Read recent Indonesian and global wildfire-related reports.
5. Open direct donation pages for verified wildfire-relief campaigns or global nonprofit options.

Artemis is an information and triage tool. Satellite detections are observations, not a fire-spread forecast, incident-command instruction, or evacuation order. Always confirm conditions with local authorities and field reports.

## Main Features

### Live satellite hotspot intelligence

- NASA FIRMS MODIS NRT observations.
- NASA FIRMS VIIRS NOAA-21 NRT observations.
- NASA FIRMS VIIRS SNPP NRT observations.
- NOAA-21 and SNPP are merged into one VIIRS layer.
- The request uses a five-day FIRMS window, then displays only the visitor's current local calendar date.
- The map renders the highest-FRP points per layer to keep the interface responsive.
- Raw MODIS, raw VIIRS, and harmonized layers can be toggled independently.

### MODIS + VIIRS harmonization

Artemis reduces duplicate counting between sensors using a spatial-temporal clustering process:

1. Group detections by observation date.
2. Compare MODIS and VIIRS coordinates with Haversine distance.
3. Merge detections within 1 km into one harmonized event.
4. Use the highest-confidence detection as the representative coordinate.
5. Sum fire radiative power (FRP), keep maximum confidence, and calculate weighted brightness.

Harmonization is a browser-side analytical view. It does not alter the original NASA records.

### Hotspot weather

Click a hotspot to load current OpenWeatherMap data for its latitude and longitude:

- Temperature.
- Relative humidity.
- Wind speed.
- Wind direction.
- High Fire Spread Risk indicator when wind speed is at least 8 m/s and humidity is at most 35%.

The weather card includes loading, retry, and error states.

### Wildfire news

NewsData.io provides recent Indonesian and English articles using wildfire-focused terms:

```text
wildfire OR "forest fire" OR "kebakaran hutan"
```

The frontend applies an additional relevance filter and caches successful results in `localStorage` for 30 minutes. Images use a fallback when an article has no `image_url`.

### Location-aware donations

The donation widget is available on the dashboard and becomes location-specific when a hotspot is selected:

1. Nominatim reverse geocoding resolves a readable location.
2. Local relief options are filtered by `regionTags`.
3. Direct wildfire campaign links are shown first.
4. Every.org nonprofit options are searched using the selected location.
5. Each campaign can fly the Leaflet map to its area.

The wildfire campaign button opens the original campaign donation page in a new tab. It does not intentionally point to a generic platform homepage.

Default verified public wildfire links currently include:

- **Riau** — [Kitabisa: Urgent! Bantu Warga Terdampak Karhutla](https://kitabisa.com/campaign/urgentkarhutla)
- **Central Kalimantan** — [Rumah Zakat: Indonesia Darurat Karhutla](https://www.rumahzakat.org/donasi/bantu-darurat-karhutla)
- **Indonesia fallback** — [Kitabisa: Patungan untuk Hutan](https://kitabisa.com/campaign/patunganuntukhutan)

These links are public campaign links, not proof that the campaign is operated by NASA, BNPB, or officially connected to a specific FIRMS hotspot. Campaign status and availability can change and should be rechecked before production use.

### Automated campaign discovery

The optional Python service in `services/donation-discovery` discovers public Kitabisa candidates:

- Uses free Google News RSS by default.
- Uses Bing Web Search only when `BING_SEARCH_API_KEY` is configured.
- Restricts candidates to HTTPS Kitabisa URLs.
- Follows redirects and checks the final domain.
- Requires an HTML response.
- Checks location and wildfire-related terms.
- Calculates a relevance confidence score.
- Returns only candidates above the configured threshold.

The service does not access private data, login-protected pages, internal Kitabisa endpoints, CAPTCHA, or donor information. Search discovery can return no results; an empty result is safer than presenting an unverified campaign.

## Technology

### Frontend

- React 18.
- TypeScript.
- Vite.
- Tailwind CSS.
- Leaflet.
- `lucide-react`.
- Custom SVG charts and dashboard visualizations.

### Services and APIs

- Python.
- FastAPI.
- HTTPX.
- NASA FIRMS.
- OpenWeatherMap.
- NewsData.io.
- OpenStreetMap Nominatim.
- Every.org.
- Google News RSS.
- Optional Bing Web Search API.

## API Integrations

| API/service | Endpoint or access | Used for | Client behavior |
|---|---|---|---|
| NASA FIRMS | `GET /api/firms?product=…&days=5&date=…` (serverless proxy → `firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{PRODUCT}/world/{DAYS}/{DATE}`) | MODIS NRT, VIIRS NOAA-21 NRT, and VIIRS SNPP NRT hotspots | Requests a five-day window, filters to the visitor's current local date, merges NOAA-21 + SNPP as VIIRS, and caches successful responses in `sessionStorage` for 30 minutes |
| OpenWeatherMap | `GET /api/weather?lat=…&lon=…` (serverless proxy → OpenWeatherMap) | Current weather at a selected hotspot | Sends `lat`, `lon`, `appid`, and `units=metric`; maps temperature, humidity, wind speed, and wind direction |
| NewsData.io | `GET /api/news` (serverless proxy → NewsData.io) | Wildfire news | Sends wildfire query terms with `language=id,en`, environment category, and caches results in `localStorage` for 30 minutes |
| OpenStreetMap Nominatim | `https://nominatim.openstreetmap.org/search` and `/reverse` | Forward and reverse geocoding | Resolves campaign locations and hotspot context; requests include a descriptive user agent |
| Every.org | `GET /api/everyorg?term=…` (serverless proxy → Every.org) | Global wildfire nonprofits | Searches `wildfire {location}` with `causes=wildfires`; donation links use the nonprofit's direct `/{slug}/donate` path |
| Google News RSS | `https://news.google.com/rss/search` | Free campaign discovery fallback | Searches public Kitabisa references without a paid search key; results are redirected and validated before display |
| Bing Web Search (optional) | `https://api.bing.microsoft.com/v7.0/search` | Higher-coverage campaign discovery | Used only when `BING_SEARCH_API_KEY` is configured; never required for local development |

API keys are read from server-side environment variables by the functions in `api/` and are never sent to the browser. Only `VITE_*` values are bundled into the site.

## Deployment (Vercel)

The browser never talks to FIRMS, OpenWeatherMap, NewsData.io or Every.org directly. It calls same-origin
serverless functions in [`api/`](api), which hold the API keys, validate input, and cache responses at the CDN
(30 min for FIRMS/news, 10 min for weather). The same handlers run locally via `npm run dev`.

1. Push this repository to GitHub/GitLab.
2. In Vercel: **Add New → Project**, import the repo (framework preset *Vite* is detected automatically).
3. Under **Environment Variables** add: `FIRMS_API_KEY`, `OPENWEATHER_API_KEY`, `NEWSDATA_API_KEY`, `EVERY_ORG_API_KEY`.
   Optionally `VITE_CARTO_API_KEY`, `VITE_KITABISA_*`, `VITE_DONATION_DISCOVERY_URL`.
4. Deploy. Environment variable changes require a redeploy.

CLI alternative: `npm i -g vercel && vercel --prod`.

Notes:

- `api/firms.ts` streams the FIRMS CSV and returns only the requested date and the columns the app uses, so the
  response stays small. It needs a function duration above the default; `vercel.json` sets 60 s.
- Old `VITE_FIRMS_API_KEY` / `VITE_OPENWEATHER_API_KEY` / `VITE_NEWSDATA_API_KEY` / `VITE_EVERY_ORG_API_KEY`
  names still work as a server-side fallback, but rename them: `VITE_*` values are readable by anyone.
- There is no rate limiting. Add Vercel Firewall rate limits before a public launch.
- If you use the Python discovery service, host it on a public HTTPS URL, set `VITE_DONATION_DISCOVERY_URL`, and
  add your production origin to `allow_origins` in `services/donation-discovery/app/main.py`.
- Other hosts (Netlify, Cloudflare) need the four `api/*.ts` handlers ported to their function format.

## Getting Started

### Requirements

- Node.js 18 or newer.
- npm.
- Python 3.11 or newer for the optional discovery service.

### Frontend setup

From the project directory:

```powershell
npm install
Copy-Item .env.example .env
```

Set the required values in `.env`:

```env
FIRMS_API_KEY=
OPENWEATHER_API_KEY=
NEWSDATA_API_KEY=
EVERY_ORG_API_KEY=
VITE_CARTO_API_KEY=
```

Optional direct campaign overrides:

```env
VITE_KITABISA_RIAU_URL=
VITE_KITABISA_CENTRAL_KALIMANTAN_URL=
VITE_KITABISA_INDONESIA_URL=
```

Only use verified URLs that open a real campaign or donation form. Do not use the Kitabisa homepage as a campaign URL.

Run the frontend:

```powershell
npm.cmd run dev
```

The default Vite URL is `http://localhost:5173/`.

Useful frontend commands:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

### Optional donation discovery service

Install the service dependencies:

```powershell
py -3 -m pip install -r services\donation-discovery\requirements.txt
```

Start the service:

```powershell
Set-Location services\donation-discovery
py -3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The service does not require a paid API key when using Google News RSS. To use optional Bing search, set:

```powershell
$env:BING_SEARCH_API_KEY="your-key"
```

Then set this frontend value and restart Vite:

```env
VITE_DONATION_DISCOVERY_URL=http://127.0.0.1:8000
```

Endpoints:

```text
GET http://127.0.0.1:8000/health
GET http://127.0.0.1:8000/campaigns?location=Riau
```

The service currently allows local development origins on ports 5173, 5174, and 5175. Configure a restricted production origin before deployment.

## Environment Variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_CARTO_API_KEY` | Optional | CARTO map tile access |
| `FIRMS_API_KEY` | Yes for live hotspots | NASA FIRMS MAP_KEY (server-side) |
| `OPENWEATHER_API_KEY` | Yes for weather | OpenWeatherMap current weather (server-side) |
| `NEWSDATA_API_KEY` | Yes for news | NewsData.io wildfire news (server-side) |
| `EVERY_ORG_API_KEY` | Yes for global donations | Every.org API key (server-side) |
| `VITE_KITABISA_RIAU_URL` | Optional | Override the default Riau campaign |
| `VITE_KITABISA_CENTRAL_KALIMANTAN_URL` | Optional | Override the default Kalimantan campaign |
| `VITE_KITABISA_INDONESIA_URL` | Optional | Override the national campaign |
| `VITE_DONATION_DISCOVERY_URL` | Optional | URL of the Python discovery service |

## Project Structure

```text
src/
├── App.tsx                         # Main dashboard orchestration
├── components/
│   ├── AboutModal.tsx              # Interactive Artemis and NASA Space Apps overview
│   ├── DonationCard.tsx            # Direct campaign and map-navigation actions
│   ├── DonationWidget.tsx          # Location-aware donation container
│   ├── FireMap.tsx                 # Leaflet map, markers, weather and location bridge
│   ├── NewsSlider.tsx              # Cached wildfire news feed
│   ├── WeatherInfoCard.tsx         # Weather and fire-spread risk card
│   └── ...                         # Dashboard, chart and region components
├── data/
│   ├── donationApi.ts              # Local campaigns, Every.org and discovery client
│   ├── firmsApi.ts                 # NASA FIRMS requests, parsing and live-date filtering
│   ├── locationApi.ts              # Nominatim geocoding and reverse geocoding
│   ├── newsDataApi.ts              # NewsData.io query, relevance filter and cache
│   └── weatherApi.ts               # OpenWeatherMap request and response mapping
├── index.css                       # Global theme and dashboard styles
└── leaflet-theme.css               # Leaflet dark theme overrides
services/
└── donation-discovery/
    ├── app/main.py                 # FastAPI discovery and validation service
    ├── requirements.txt            # Python dependencies
    └── .env.example                # Optional Bing key placeholder
```

## Data Freshness and Limitations

- NASA FIRMS is near-real-time and may have processing delay.
- The map displays the current browser-date observation rather than promising instant detection.
- OpenWeatherMap describes current conditions at the selected coordinate, not future fire behavior.
- NewsData.io articles are external reporting and are not incident verification.
- Nominatim is a public geocoding service and should be rate-limited in production.
- Donation links are external pages. Artemis does not process payments, verify organizations, or guarantee campaign availability.
- Automated discovery is a candidate finder, not an official Kitabisa integration.
- API quotas, CORS policies, third-party outages, and campaign changes can affect availability.

## Team and Event

**Team:** ITS Surabaya — Institut Teknologi Sepuluh Nopember, Indonesia

### Contributors

| Name | Handle | Role |
|---|---|---|
| Fadhil Mauludi | `@fadhilm` | Team owner |
| Ellvis Cornelius Setiawan | `@ellviscs` | Contributor |
| Desanda Verdely Yulisar | `@mrpupperfish` | Contributor |
| Evan Dakara Sukatrilaksana | `@evandakara` | Contributor |
| Jonathan Itung | `@jonathanitung` | Contributor |
| Muhammad Syamfiraas Akbar | `@firz` | Contributor |

**Event:** [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/)

## License and External Services

Review the license and terms of each external data provider before public deployment. Follow the attribution requirements for OpenStreetMap/Nominatim, CARTO, NASA FIRMS, and every other external service used by the application.
