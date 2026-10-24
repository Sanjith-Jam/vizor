import type { Point } from "./contracts.ts";

/** Live map coverage is all of India; Katpadi remains the scripted demo area. */
export const INDIA_CENTER: Point = { lat: 22.5, lon: 79 };
export const INDIA_BOUNDS = {
  south: 6.5,
  west: 68.1,
  north: 35.7,
  east: 97.4,
};
/** The map service answers pothole queries for areas up to one degree. */
export const MAX_REPORT_SPAN_DEG = 1;
export function reportsAvailable(b: {
  south: number;
  north: number;
  west: number;
  east: number;
}): boolean {
  return (
    b.north - b.south <= MAX_REPORT_SPAN_DEG &&
    b.east - b.west <= MAX_REPORT_SPAN_DEG
  );
}
