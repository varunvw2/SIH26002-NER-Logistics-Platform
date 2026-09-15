import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const RISK_COLORS = { green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444' };
const LOCATION_ICON = { warehouse: '🏭', hospital: '🏥', relief_center: '⛺', transport_hub: '🚉' };

// Plain emoji div-icons (no image files) - centered for vehicles/incidents,
// bottom-anchored (pin-style) for fixed locations. className:'' strips
// Leaflet's default white box/border around div icons.
function divIcon(emoji, { size = 22, anchor = 'center' } = {}) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: anchor === 'bottom' ? [size / 2, size] : [size / 2, size / 2]
  });
}

const toLatLngs = (coordinates) => coordinates.map(([lng, lat]) => [lat, lng]);

/**
 * MODULE 1 - shared GIS map used by Dashboard, NER Map, Route Planner,
 * Vehicle Tracking, Emergency Mode and the Driver Journey. Real OpenStreetMap
 * tiles via Leaflet (not a flat-color demo vector style) - actual streets,
 * terrain and place labels. Takes plain data props (roads/vehicles/etc. use
 * [lng,lat] GeoJSON order like the rest of the app; this component converts
 * to Leaflet's [lat,lng] internally) so no caller needs to know which map
 * library is underneath.
 */
export default function MapView({
  roads = [], vehicles = [], incidents = [], locations = [], routeCandidates = [],
  center = [92.5, 26.0], zoom = 5.6, height = '100%', onRoadClick
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const roadsLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const markersRef = useRef(new Map()); // key -> L.Marker, for in-place updates
  // Always-current callback ref so the road click handlers (attached once
  // per data update, not per render) never close over a stale onRoadClick.
  const onRoadClickRef = useRef(onRoadClick);
  onRoadClickRef.current = onRoadClick;

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [center[1], center[0]],
      zoom,
      zoomControl: false
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    roadsLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Roads, colored by live risk level.
  useEffect(() => {
    const layer = roadsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const r of roads) {
      if (!r.coordinates || r.coordinates.length < 2) continue;
      const line = L.polyline(toLatLngs(r.coordinates), {
        color: RISK_COLORS[r.risk_level] || RISK_COLORS.green,
        weight: 4
      });
      line.on('click', () => onRoadClickRef.current?.({
        id: r.id, name: r.name, status: r.status, risk_level: r.risk_level, risk_score: r.risk_score
      }));
      line.on('mouseover', () => { containerRef.current.style.cursor = 'pointer'; });
      line.on('mouseout', () => { containerRef.current.style.cursor = ''; });
      line.addTo(layer);
    }
  }, [roads]);

  // Candidate routes: recommended solid+thick, alternatives dashed+thin -
  // auto-frames the camera to whatever routes just arrived (e.g. Route
  // Planner results), since a fixed center/zoom might not show them all.
  useEffect(() => {
    const layer = routesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const allLatLngs = [];
    for (const r of routeCandidates) {
      if (!r.coordinates || r.coordinates.length < 2) continue;
      const latlngs = toLatLngs(r.coordinates);
      allLatLngs.push(...latlngs);
      const isRecommended = r.status === 'recommended';
      L.polyline(latlngs, {
        color: RISK_COLORS[r.risk_level] || RISK_COLORS.green,
        weight: isRecommended ? 6 : 3,
        dashArray: isRecommended ? null : '9 6'
      }).addTo(layer);
    }
    if (allLatLngs.length >= 2 && mapRef.current) {
      // animate:false matters here, not just cosmetics - an in-flight pan/
      // zoom animation racing against a marker layer being torn down and
      // rebuilt (see the marker effect below) is what corrupts Leaflet's
      // internal position cache and throws "_leaflet_pos" errors.
      mapRef.current.fitBounds(L.latLngBounds(allLatLngs), { padding: [60, 60], maxZoom: 9, animate: false });
    }
  }, [routeCandidates]);

  // Vehicles, incidents, fixed locations - updates existing markers IN PLACE
  // (by id) rather than clearing and recreating the whole layer every time.
  // This matters for more than performance: a live-tracked vehicle's marker
  // gets new coordinates every ~4s poll, and destroying/recreating a Leaflet
  // marker while the map may be mid-pan/zoom is exactly what corrupts
  // Leaflet's internal position cache (throws "_leaflet_pos" errors).
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    const refs = markersRef.current;
    const seen = new Set();

    const upsert = (key, lat, lng, makeIcon, tooltip) => {
      seen.add(key);
      const existing = refs.get(key);
      if (existing) {
        existing.setLatLng([lat, lng]);
        existing.setTooltipContent(tooltip);
      } else {
        const marker = L.marker([lat, lng], { icon: makeIcon() }).bindTooltip(tooltip).addTo(layer);
        refs.set(key, marker);
      }
    };

    for (const v of vehicles) {
      if (v.lat == null || v.lng == null) continue;
      upsert(`veh-${v.id}`, v.lat, v.lng, () => divIcon('🚚'), `${v.number} - ${v.status}`);
    }
    for (const i of incidents) {
      if (i.lat == null || i.lng == null) continue;
      const emoji = i.severity === 'critical' ? '🟥' : i.severity === 'high' ? '🟧' : '⚠️';
      upsert(`inc-${i.id}`, i.lat, i.lng, () => divIcon(emoji, { size: 20 }), `${i.type} (${i.severity})`);
    }
    for (const l of locations) {
      if (l.lat == null || l.lng == null) continue;
      upsert(`loc-${l.id}`, l.lat, l.lng, () => divIcon(LOCATION_ICON[l.type] || '📍', { size: 18, anchor: 'bottom' }), l.name);
    }

    for (const [key, marker] of refs) {
      if (!seen.has(key)) {
        layer.removeLayer(marker);
        refs.delete(key);
      }
    }
  }, [vehicles, incidents, locations]);

  return <div ref={containerRef} style={{ width: '100%', height }} className="rounded-lg overflow-hidden" />;
}
