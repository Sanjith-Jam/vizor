import { useEffect, useRef, useState } from "react";
import type { Point, Pothole } from "../../../shared/contracts";
import type { RoadConditions } from "../../../shared/roadConditions";
import { fetchRouteConditions } from "../../../shared/roadAlerts";

export type RouteConditionsState = {
  data: (RoadConditions & { complete: boolean }) | null;
  failed: boolean;
};

/** Speed breakers and rough roads along every route alternative. */
export function useRouteConditions(
  routes: Point[][],
  potholes: Pothole[],
): RouteConditionsState {
  const [state, setState] = useState<RouteConditionsState>({
    data: null,
    failed: false,
  });
  const latestPotholes = useRef(potholes);
  latestPotholes.current = potholes;
  useEffect(() => {
    setState({ data: null, failed: false });
    if (!routes.length) return;
    const controller = new AbortController();
    fetchRouteConditions(routes, latestPotholes.current, controller.signal)
      .then((data) => setState({ data, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ data: null, failed: true });
      });
    return () => controller.abort();
  }, [routes]);
  return state;
}
