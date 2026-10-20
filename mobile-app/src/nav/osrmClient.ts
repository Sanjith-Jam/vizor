import { cloudApi } from "../cloud/client";
import { validateRoutePlans } from "../../../shared/contracts";
import { type Route } from "./route";
import type { LatLon } from "./geo";
export type { Place } from "../../../shared/contracts";
import type { Place } from "../../../shared/contracts";
export async function fetchRoutes(from: LatLon, to: LatLon): Promise<Route[]> {
  return validateRoutePlans(await cloudApi("routes", { from, to }));
}
export async function fetchRoute(from: LatLon, to: LatLon): Promise<Route> {
  return (await fetchRoutes(from, to))[0];
}
export async function searchPlaces(
  query: string,
  _near?: LatLon | null,
): Promise<Place[]> {
  return cloudApi<Place[]>("places", { query, near: _near });
}
/** Route currently previewed on the Navigate screen, so the voice assistant
 * can start it. ponytail: module state, move into RideProvider if more
 * screens need it. */
export const plannedRide: { destination: Place | null; route: Route | null } = {
  destination: null,
  route: null,
};
