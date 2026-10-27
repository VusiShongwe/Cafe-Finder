# Cafe Finder (free, no API key)

Find cafes near you or in any suburb using live OpenStreetMap data. No account, API key or billing needed.

## Run it
Serve the folder, then open the address it prints:
```
python -m http.server 8000     # or: npx serve .
```
Open http://localhost:8000

## Features
- Nearby search from your location, or search by suburb
- Filter by Wi-Fi and outdoor seating, sort by distance or name
- Hours, wheelchair access, vegan options and website shown when mapped
- Favourites saved in localStorage
- "Search this area" after panning the map
- Responsive and keyboard friendly

## Data sources
- Map tiles and cafe data: OpenStreetMap contributors (ODbL)
- Cafe queries: Overpass API
- Suburb lookup: Nominatim (limit yourself to about one request per second)
- Map library: Leaflet

## Notes
OpenStreetMap is volunteer-edited, so some cafes lack hours or tags, and it has no ratings.

## Ideas to extend
- Parse `opening_hours` with the opening_hours.js library to add an Open now filter
- Cache results to reduce Overpass requests
- Let users add a missing cafe by linking to openstreetmap.org
