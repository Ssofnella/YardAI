"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageryConfig } from "@/lib/imagery/naip";
import { insideNaip } from "@/lib/imagery/naip";
import { doorsAlongWall, type LayoutDoor } from "@/lib/onboarding/layout";
import { bboxAround, distanceMeters, type LngLat } from "@/lib/onboarding/geo";
import { cn } from "cn";

type Props = {
  imagery: ImageryConfig;
  center: LngLat;
  mode: "pin" | "edit";
  doors: LayoutDoor[];
  onDoors: (doors: LayoutDoor[]) => void;
  onPin?: (point: LngLat) => void;
  underlayUrl?: string | null;
};

const TOOLS = [
  { id: "select", label: "Select" },
  { id: "linestring", label: "Wall" },
  { id: "point", label: "Door" },
  { id: "polygon", label: "Zone" },
] as const;

export function MapEditor({ imagery, center, mode, doors, onDoors, onPin, underlayUrl }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const drawRef = useRef<{
    undo: () => boolean;
    redo: () => boolean;
    setMode: (mode: string) => void;
    getSnapshot: () => { geometry: { type: string; coordinates: unknown } }[];
  } | null>(null);
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const onDoorsRef = useRef(onDoors);
  onDoorsRef.current = onDoors;
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const history = useRef<LayoutDoor[][]>([doors]);
  const future = useRef<LayoutDoor[][]>([]);
  const fromEditor = useRef(false);
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("select");
  const [count, setCount] = useState(20);
  const [message, setMessage] = useState<string | null>(null);
  const covered =
    imagery.provider === "txgio" ||
    imagery.provider === "plain" ||
    imagery.provider === "licensed_basemap" ||
    (imagery.provider === "naip" && insideNaip(center.lng, center.lat));

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    void Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl.css"),
      import("terra-draw"),
      import("terra-draw-maplibre-gl-adapter"),
    ]).then(([ml, , drawMod, adapterMod]) => {
      if (cancelled) return;
      const style = imagery.tileTemplate
        ? {
            version: 8 as const,
            sources: {
              naip: {
                type: "raster" as const,
                tiles: [imagery.tileTemplate],
                tileSize: 256,
                minzoom: imagery.minZoom,
                maxzoom: imagery.maxZoom,
                bounds: [imagery.bounds.west, imagery.bounds.south, imagery.bounds.east, imagery.bounds.north] as [
                  number,
                  number,
                  number,
                  number,
                ],
                attribution: imagery.label,
              },
            },
            layers: [{ id: "naip", type: "raster" as const, source: "naip" }],
          }
        : {
            version: 8 as const,
            sources: {},
            layers: [],
          };
      map = new ml.Map({
        container: node,
        center: [center.lng, center.lat],
        zoom: covered ? 16 : 14,
        maxZoom: imagery.maxZoom,
        style: style as import("maplibre-gl").StyleSpecification,
        attributionControl: false,
      });
      map.on("load", () => {
        if (!map) return;
        if (underlayUrl) {
          const box = bboxAround({ lng: center.lng, lat: center.lat }, 70);
          map.addSource("upload-underlay", {
            type: "image",
            url: underlayUrl,
            coordinates: [
              [box.west, box.north],
              [box.east, box.north],
              [box.east, box.south],
              [box.west, box.south],
            ],
          });
          map.addLayer({
            id: "upload-underlay",
            type: "raster",
            source: "upload-underlay",
            paint: { "raster-opacity": 0.72 },
          });
        }
        map.addSource("draft-doors", {
          type: "geojson",
          data: doorCollection(doorsRef.current),
        });
        map.addLayer({
          id: "draft-doors",
          type: "circle",
          source: "draft-doors",
          paint: {
            "circle-radius": 8,
            "circle-color": ["match", ["get", "status"], "accepted", "#1e3a8a", "edited", "#1e3a8a", "#6d28d9"],
            "circle-stroke-width": 2,
            "circle-stroke-color": ["match", ["get", "status"], "accepted", "#1e3a8a", "edited", "#1e3a8a", "#6d28d9"],
            "circle-opacity": ["match", ["get", "status"], "suggested", 0.35, 0.95],
          },
        });
        mapRef.current = map;
        if (mode === "pin") {
          const marker = new ml.Marker({ draggable: true, color: "#1e40af" })
            .setLngLat([center.lng, center.lat])
            .addTo(map);
          marker.on("dragend", () => {
            const lngLat = marker.getLngLat();
            onPinRef.current?.({ lng: lngLat.lng, lat: lngLat.lat });
          });
          return;
        }
        const snapping = { toCoordinate: true, toLine: true };
        const draw = new drawMod.TerraDraw({
          adapter: new adapterMod.TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new drawMod.TerraDrawSelectMode({
              flags: {
                linestring: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, snappable: true } } },
                point: { feature: { draggable: true, coordinates: { draggable: true, snappable: true } } },
                polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, snappable: true } } },
              },
            }),
            new drawMod.TerraDrawPointMode({ snapping }),
            new drawMod.TerraDrawLineStringMode({ snapping }),
            new drawMod.TerraDrawPolygonMode({ snapping }),
          ],
        });
        draw.start();
        draw.setMode("select");
        drawRef.current = draw;
      });
    }).catch(() => setMessage("The map did not start. You can still use the grid template."));

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [center.lng, center.lat, imagery.tileTemplate, imagery.label, imagery.maxZoom, imagery.minZoom, imagery.bounds.west, imagery.bounds.south, imagery.bounds.east, imagery.bounds.north, mode, covered, underlayUrl]);

  useEffect(() => {
    const source = mapRef.current?.getSource("draft-doors") as { setData?: (data: GeoJSON.FeatureCollection) => void } | undefined;
    source?.setData?.(doorCollection(doors));
    if (fromEditor.current) {
      fromEditor.current = false;
      return;
    }
    history.current = [doors];
    future.current = [];
  }, [doors]);

  function remember(next: LayoutDoor[]) {
    fromEditor.current = true;
    future.current = [];
    history.current = [...history.current, next].slice(-50);
    try {
      window.sessionStorage.setItem("yardline.door-history", JSON.stringify(history.current));
    } catch {
      // The draft still lives in memory for this step.
    }
    onDoorsRef.current(next);
  }

  function undoDoors() {
    if (history.current.length > 1) {
      const current = history.current[history.current.length - 1];
      future.current.push(current);
      history.current = history.current.slice(0, -1);
      fromEditor.current = true;
      onDoorsRef.current(history.current[history.current.length - 1] ?? []);
      setMessage("Undid the last door draft.");
      return;
    }
    const did = drawRef.current?.undo() ?? false;
    if (!did) setMessage("Nothing to undo.");
  }

  function redoDoors() {
    const next = future.current.pop();
    if (next) {
      history.current = [...history.current, next].slice(-50);
      fromEditor.current = true;
      onDoorsRef.current(next);
      return;
    }
    drawRef.current?.redo();
  }

  function placeAlongWall() {
    const snapshot = drawRef.current?.getSnapshot() ?? [];
    const line = [...snapshot].reverse().find((feature) => feature.geometry.type === "LineString");
    if (!line || line.geometry.type !== "LineString") {
      setMessage("Draw the dock wall first. Two taps, then Add doors along this wall.");
      return;
    }
    const coords = line.geometry.coordinates as [number, number][];
    if (coords.length < 2) return;
    const from = { lng: coords[0][0], lat: coords[0][1] };
    const to = { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };
    const meters = distanceMeters(from, to);
    const guessed = Math.max(1, Math.round(meters / 4));
    const used = count > 0 ? count : guessed;
    const existing = doorsRef.current.filter((door) => door.status !== "rejected");
    const added = doorsAlongWall(from, to, used).map((door, index) => ({
      ...door,
      key: `door-wall-${existing.length + index + 1}-${Math.round(from.lng * 1e5)}`,
      name: `D${String(existing.length + index + 1).padStart(2, "0")}`,
    }));
    setMessage(
      `Drafted ${used} doors at about 4 m spacing on a ${Math.round(meters)} m wall. Low confidence. Nothing is saved until you accept them.`,
    );
    remember([...existing, ...added]);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[72px_minmax(0,1fr)]">
      {mode === "edit" ? (
        <div className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "min-h-16 min-w-16 rounded-card border-2 px-2 text-xs font-semibold",
                tool === item.id ? "border-primary bg-primary text-white" : "border-slate-950 bg-white",
              )}
              onClick={() => {
                setTool(item.id);
                drawRef.current?.setMode(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="min-h-16 min-w-16 rounded-card border-2 border-slate-950 bg-white text-xs font-semibold" onClick={undoDoors}>
            Undo
          </button>
          <button type="button" className="min-h-16 min-w-16 rounded-card border-2 border-slate-950 bg-white text-xs font-semibold" onClick={redoDoors}>
            Redo
          </button>
        </div>
      ) : null}
      <div className="relative">
        <div ref={holder} className="h-[420px] w-full overflow-hidden rounded-card border-2 border-slate-950 bg-slate-200" />
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/95 px-2 py-1 text-xs font-semibold text-slate-950">
          {imagery.label}
        </p>
      </div>
      {mode === "edit" ? (
        <div className="flex flex-wrap items-end gap-3 lg:col-start-2">
          <label className="text-sm font-semibold">
            Doors along the wall
            <input
              type="number"
              min={1}
              max={40}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-1 block min-h-12 w-24 rounded-card border-2 border-slate-950 px-2"
            />
          </label>
          <button type="button" className="min-h-16 rounded-card bg-primary px-4 text-sm font-semibold text-white" onClick={placeAlongWall}>
            Add doors along this wall
          </button>
          <p className="max-w-xl text-sm text-ink-muted">
            {covered
              ? imagery.note
              : "This pin is outside the imagery shipped for this basemap. Use a grid template, upload your own photo, or move the pin."}
          </p>
          <p className="w-full text-xs text-ink-muted">{imagery.attribution}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{imagery.note} Drag the pin onto the building. That sets the location to a pin you placed.</p>
      )}
      {message ? <p className="text-sm lg:col-start-2">{message}</p> : null}
    </div>
  );
}

function doorCollection(doors: LayoutDoor[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: doors
      .filter((door) => door.status !== "rejected")
      .map((door) => ({
        type: "Feature" as const,
        properties: { name: door.name, status: door.status },
        geometry: { type: "Point" as const, coordinates: [door.position.lng, door.position.lat] },
      })),
  };
}
