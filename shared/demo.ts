import type { Pothole, RoutePlan } from "./contracts";
// OSM/OSRM road geometry captured 2026-10-18. Positions and hazards are a scripted sample, not a recorded ride.
export const DEMO_START = { lat: 12.966191, lon: 79.137486 };
export const DEMO_ROUTE: RoutePlan = {
  distance: 2969.5,
  duration: 349.8,
  geometry: [
    {
      lat: 12.966191,
      lon: 79.137486,
    },
    {
      lat: 12.966185,
      lon: 79.137733,
    },
    {
      lat: 12.966614,
      lon: 79.138226,
    },
    {
      lat: 12.96667,
      lon: 79.138284,
    },
    {
      lat: 12.966752,
      lon: 79.138316,
    },
    {
      lat: 12.967439,
      lon: 79.139077,
    },
    {
      lat: 12.968485,
      lon: 79.140338,
    },
    {
      lat: 12.968638,
      lon: 79.140593,
    },
    {
      lat: 12.968684,
      lon: 79.140747,
    },
    {
      lat: 12.968745,
      lon: 79.141209,
    },
    {
      lat: 12.968758,
      lon: 79.141669,
    },
    {
      lat: 12.968757,
      lon: 79.141704,
    },
    {
      lat: 12.968784,
      lon: 79.142273,
    },
    {
      lat: 12.968835,
      lon: 79.142986,
    },
    {
      lat: 12.968903,
      lon: 79.143942,
    },
    {
      lat: 12.968947,
      lon: 79.14473,
    },
    {
      lat: 12.968953,
      lon: 79.144818,
    },
    {
      lat: 12.968924,
      lon: 79.145666,
    },
    {
      lat: 12.968878,
      lon: 79.145948,
    },
    {
      lat: 12.968766,
      lon: 79.146449,
    },
    {
      lat: 12.968731,
      lon: 79.146624,
    },
    {
      lat: 12.968598,
      lon: 79.147048,
    },
    {
      lat: 12.968481,
      lon: 79.147422,
    },
    {
      lat: 12.968467,
      lon: 79.147466,
    },
    {
      lat: 12.968202,
      lon: 79.148279,
    },
    {
      lat: 12.968039,
      lon: 79.148723,
    },
    {
      lat: 12.967958,
      lon: 79.148979,
    },
    {
      lat: 12.967898,
      lon: 79.149253,
    },
    {
      lat: 12.967878,
      lon: 79.149667,
    },
    {
      lat: 12.967893,
      lon: 79.150131,
    },
    {
      lat: 12.967935,
      lon: 79.15077,
    },
    {
      lat: 12.967976,
      lon: 79.151219,
    },
    {
      lat: 12.967985,
      lon: 79.151328,
    },
    {
      lat: 12.968098,
      lon: 79.152578,
    },
    {
      lat: 12.968106,
      lon: 79.153007,
    },
    {
      lat: 12.968118,
      lon: 79.153391,
    },
    {
      lat: 12.968113,
      lon: 79.153981,
    },
    {
      lat: 12.968111,
      lon: 79.154255,
    },
    {
      lat: 12.968108,
      lon: 79.15457,
    },
    {
      lat: 12.968108,
      lon: 79.1546,
    },
    {
      lat: 12.968131,
      lon: 79.155315,
    },
    {
      lat: 12.968633,
      lon: 79.155333,
    },
    {
      lat: 12.968811,
      lon: 79.155342,
    },
    {
      lat: 12.96881,
      lon: 79.155398,
    },
    {
      lat: 12.968809,
      lon: 79.155463,
    },
    {
      lat: 12.968804,
      lon: 79.155736,
    },
    {
      lat: 12.968803,
      lon: 79.155813,
    },
    {
      lat: 12.968798,
      lon: 79.156115,
    },
    {
      lat: 12.968793,
      lon: 79.156454,
    },
    {
      lat: 12.968792,
      lon: 79.156548,
    },
    {
      lat: 12.968774,
      lon: 79.157204,
    },
    {
      lat: 12.968765,
      lon: 79.157464,
    },
    {
      lat: 12.968732,
      lon: 79.158516,
    },
    {
      lat: 12.968726,
      lon: 79.158659,
    },
    {
      lat: 12.969624,
      lon: 79.158693,
    },
    {
      lat: 12.969608,
      lon: 79.158826,
    },
    {
      lat: 12.968618,
      lon: 79.158717,
    },
    {
      lat: 12.968622,
      lon: 79.158787,
    },
    {
      lat: 12.968683,
      lon: 79.15943,
    },
    {
      lat: 12.968759,
      lon: 79.159764,
    },
    {
      lat: 12.968913,
      lon: 79.160397,
    },
    {
      lat: 12.969175,
      lon: 79.160948,
    },
  ],
  steps: [
    {
      maneuver: {
        type: "depart",
        modifier: "left",
      },
      location: {
        lat: 12.966191,
        lon: 79.137486,
      },
      roadName: "",
      distance: 26.8,
      instruction: "Head out",
    },
    {
      maneuver: {
        type: "turn",
        modifier: "left",
      },
      location: {
        lat: 12.966185,
        lon: 79.137733,
      },
      roadName: "Tiruvalam - Katpadi Road",
      distance: 2031.2,
      instruction: "Turn left onto Tiruvalam - Katpadi Road",
    },
    {
      maneuver: {
        type: "turn",
        modifier: "left",
      },
      location: {
        lat: 12.968131,
        lon: 79.155315,
      },
      roadName: "Chandra Avenue",
      distance: 75.3,
      instruction: "Turn left onto Chandra Avenue",
    },
    {
      maneuver: {
        type: "turn",
        modifier: "right",
      },
      location: {
        lat: 12.968811,
        lon: 79.155342,
      },
      roadName: "King Road",
      distance: 360,
      instruction: "Turn right onto King Road",
    },
    {
      maneuver: {
        type: "end of road",
        modifier: "left",
      },
      location: {
        lat: 12.968726,
        lon: 79.158659,
      },
      roadName: "Naipaul Avenue",
      distance: 99.4,
      instruction: "Turn left onto Naipaul Avenue",
    },
    {
      maneuver: {
        type: "turn",
        modifier: "right",
      },
      location: {
        lat: 12.969624,
        lon: 79.158693,
      },
      roadName: "",
      distance: 14.5,
      instruction: "Turn right",
    },
    {
      maneuver: {
        type: "turn",
        modifier: "right",
      },
      location: {
        lat: 12.969608,
        lon: 79.158826,
      },
      roadName: "",
      distance: 362.3,
      instruction: "Turn right",
    },
    {
      maneuver: {
        type: "arrive",
        modifier: "left",
      },
      location: {
        lat: 12.969175,
        lon: 79.160948,
      },
      roadName: "",
      distance: 0,
      instruction: "Arrive at your destination",
    },
  ],
};
export const DEMO_POTHOLES: Pothole[] = [
  {
    id: "demo-01",
    lat: 12.968784,
    lon: 79.142273,
    status: "corroborated",
    sightings: 4,
    first_seen: "2026-10-10T08:00:00Z",
    last_seen: "2026-10-13T08:00:00Z",
    uncertainty_m: 10,
  },
  {
    id: "demo-02",
    lat: 12.968039,
    lon: 79.148723,
    status: "suspected",
    sightings: 1,
    first_seen: "2026-10-10T08:00:00Z",
    last_seen: "2026-10-13T08:00:00Z",
    uncertainty_m: 10,
  },
  {
    id: "demo-03",
    lat: 12.968633,
    lon: 79.155333,
    status: "disputed",
    sightings: 2,
    first_seen: "2026-10-10T08:00:00Z",
    last_seen: "2026-10-13T08:00:00Z",
    uncertainty_m: 10,
  },
  {
    id: "demo-04",
    lat: 12.968726,
    lon: 79.158659,
    status: "repaired",
    sightings: 3,
    first_seen: "2026-10-10T08:00:00Z",
    last_seen: "2026-10-13T08:00:00Z",
    uncertainty_m: 10,
  },
];
