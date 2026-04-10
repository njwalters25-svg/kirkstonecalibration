// ============================================================
// routing.js — Postcode lookup & driving route estimation
// Uses postcodes.io (free, no key) + OSRM (free, no key)
// ============================================================

async function geocodePostcode(postcode) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error(`Postcode "${postcode}" not found`);
  const data = await res.json();
  if (data.status !== 200 || !data.result) throw new Error(`Postcode "${postcode}" not found`);
  return {
    lat: data.result.latitude,
    lng: data.result.longitude,
    postcode: data.result.postcode,
  };
}

async function getDrivingRoute(fromCoords, toCoords) {
  // OSRM expects lng,lat order
  const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Routing service unavailable');
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No route found');
  const route = data.routes[0];
  return {
    distanceMiles: route.distance / 1609.344,   // metres to miles
    durationMinutes: route.duration / 60,        // seconds to minutes
  };
}

async function calculateRoute(homePostcode, destinationPostcode) {
  const from = await geocodePostcode(homePostcode);
  const to = await geocodePostcode(destinationPostcode);
  const route = await getDrivingRoute(from, to);
  return {
    from: from.postcode,
    to: to.postcode,
    distanceMiles: Math.round(route.distanceMiles * 10) / 10,
    durationMinutes: Math.round(route.durationMinutes),
  };
}
