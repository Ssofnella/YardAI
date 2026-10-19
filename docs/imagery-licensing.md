# Imagery licensing

Checked against the Texas Geographic Information Office (TxGIO, formerly TNRIS) site on 19 Oct 2026. Yardline uses this for the onboarding basemap. Google, Mapbox, and Esri imagery are not used for tracing or as model input.

## What Yardline uses

| Source | When | Resolution | Sent to a model |
| --- | --- | --- | --- |
| TxGIO StratMap county ortho | The pin falls inside a StratMap service in the catalog | About 3 inch or 6 inch | No |
| USDA NAIP 2022, self-hosted | Fallback everywhere else, including Texas counties with no published StratMap service | 0.6 m | No |
| A photo or plan the user uploads | Always optional | Their file | Only that file, and only when `YARD_AI_API_KEY` is set |

The provider is selected in `lib/imagery/resolve.ts`. `YARD_IMAGERY_PROVIDER=auto` (the default when the variable is unset) tries StratMap, then NAIP. `naip`, `plain`, and `licensed_basemap` keep the older behavior. `licensed_basemap` is display-only.

## TxGIO StratMap

Program page: [StratMap](https://geographic.texas.gov/stratmap/). Orthoimagery overview: [Orthoimagery](https://geographic.texas.gov/stratmap/orthoimagery). The same pages are also published under [gio.texas.gov](https://gio.texas.gov/stratmap/orthoimagery.html). TxGIO is the office formerly called TNRIS.

### License

The StratMap program page says that after final deliverables are accepted, they are placed in the public domain for local, regional, and federal government, academia, private industry, and the public. Sample ImageServer items report `licenseInfo` as none. Yardline treats the catalogued StratMap services as public-domain county orthoimagery.

That statement does **not** cover the Texas Imagery Service.

### Data access

As of 19 Oct 2026 the public display endpoint is the TxGIO ArcGIS ImageServer folder:

`https://imagery.geographic.texas.gov/server/rest/services/StratMap`

Yardline draws tiles by calling that server's `exportImage` operation (Web Mercator bbox, PNG) from `/api/imagery/txgio/{z}/{x}/{y}`. The browser talks only to this app. The proxy allows the six service names in the catalog and the host `imagery.geographic.texas.gov`. It does not follow redirects.

Services listed in that folder on 19 Oct 2026:

- `StratMap16_NCCIR_6in_Smith` (2016, 6 inch, Smith County)
- `StratMap18_NCCIR_6in_Smith_ETX` (2018, 6 inch, East Texas counties)
- `StratMap19_NCCIR_6in_Brazos` (2019, 6 inch, Brazos area extent)
- `StratMap19_NCCIR_CapArea` (2019, 6 inch, Capital Area)
- `StratMap20_NCCIR_CapArea_McLennan` (2020, about 3 inch, Capital Area and McLennan County)
- `StratMap21_NCCIR_CapArea_Brazos_Kerr` (2021, 6 inch, Capital Area, Brazos, and Kerr)

Where two services overlap, Yardline uses the newest year. The folder is the access method for slippy tiles. File downloads, when needed outside this app, are the [TxGIO DataHub](https://data.geographic.texas.gov) and the public REST API used by [go-bulk-downloader](https://github.com/TxGIO/go-bulk-downloader). Yardline does not bulk-download or redistribute source imagery.

### Attribution

Each service's `copyrightText` is stored in `lib/imagery/txgio.ts` and shown on the location step. Every one of those strings includes the Texas Geographic Information Office plus the local partners named for that flight. The map chip uses a short label: `Imagery: TxGIO StratMap <year> (<resolution>, public domain)`.

## NAIP fallback

The shipped basemap is USDA NAIP 2022 for one Texas quarter-quad under `public/imagery`. It is public domain. The browser requests `/imagery/naip/...` on this origin. Capture year 2022, about 0.6 m. Dock doors are often invisible at that resolution, so door marks from a count are a spacing guess until a person accepts them.

NAIP is used when the pin is outside every catalogued StratMap service. That includes locations outside Texas and Texas counties that are not in the folder above. The Dallas sample pin is in the shipped NAIP scene and is **not** in the 19 Oct 2026 StratMap folder.

## What Yardline does not use

The [Texas Imagery Service](https://tnris.org/texas-imagery-service) is a statewide 6-inch service hosted with Hexagon and Sanborn. TxGIO's own description says that imagery is **not** in the public domain, is restricted to subscribing Texas public organizations and their contractors, and must not be redistributed or resold. Yardline does not call it.

Google, Mapbox, and Esri World Imagery (including `arcgisonline` and `arcgis.com` tile hosts) are not basemaps and are not model input. The StratMap server runs Esri ImageServer software. The pixels are TxGIO StratMap orthoimagery, not Esri's commercial imagery.

## Caveats

- Coverage is partial. Historical county projects, including older Dallas–Fort Worth services, are not in the live StratMap folder. Those pins fall back to NAIP even though they are in Texas.
- The catalog is a snapshot of that folder. A new county service does not appear until the catalog is updated. The provider interface is the place to add one.
- The ImageServer is a best-effort public service. If `exportImage` fails, the map has no StratMap pixels for that tile. The draft can still be built from a listing, a photo, or a grid.
- Capture year and pixel size differ by county. A yard may have changed since the flight. A person confirms every door and spot.
- StratMap and NAIP pixels are never sent to a model. Vision runs only on a file the user uploaded.
- Positional accuracy is whatever TxGIO published for that flight. The photo underlay is stretched over a square around the pin. It is a reference, not a survey.
