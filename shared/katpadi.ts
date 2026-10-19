import { validPoint, type Place, type Point } from "./contracts.ts";

export const KATPADI_CENTER: Point = { lat: 12.973, lon: 79.145 };
// Demo coverage includes Katpadi, VIT, Dharapadavedu and surrounding roads.
export const KATPADI_BOUNDS = {
  west: 79.1,
  south: 12.94,
  east: 79.2,
  north: 13.02,
};
export const KATPADI_PLACES: Place[] = [
  {
    id: "katpadi-bus-stand",
    name: "Katpadi Junction–Chittoor Bus Stand",
    address: "Vellore–Chittoor Road, Katpadi",
    location: { lat: 12.9662552, lon: 79.1374884 },
  },
  {
    id: "vit-vellore",
    name: "VIT Vellore",
    address: "Vellore Institute of Technology, Katpadi",
    location: { lat: 12.9697498, lon: 79.1606601 },
  },
];
export function inKatpadi(p: Point): boolean {
  const b = KATPADI_BOUNDS;
  return (
    validPoint(p) &&
    p.lat >= b.south &&
    p.lat <= b.north &&
    p.lon >= b.west &&
    p.lon <= b.east
  );
}
export function searchKatpadi(query: string): Place[] {
  const words = query.toLowerCase().trim().split(/\s+/);
  return words[0]
    ? KATPADI_PLACES.filter((p) =>
        words.every((w) => `${p.name} ${p.address}`.toLowerCase().includes(w)),
      )
    : [];
}
