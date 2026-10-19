/**
 * BLE Service/Characteristic UUIDs, copied verbatim from firmware/src/main.cpp.
 * Keep these two files in sync by hand - there's no shared source of truth
 * across the C++/TypeScript boundary. See ../../README.md's BLE Protocol
 * Specification for the payload format of each characteristic.
 */

export const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";

/** Read/Write. App -> helmet: [Direction: 1B][DistanceMeters: 2B big-endian]. */
export const NAV_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

/** Notify. Helmet -> app: [EventType: 1B][G-Force: 2B][Lat: 4B][Lon: 4B], all big-endian. */
export const HAZARD_CHAR_UUID = "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e";

/** Read/Write. App -> helmet: [EventType: 1B][NameLength: 1B][Name: up to 18 ASCII bytes]. */
export const CALL_CHAR_UUID = "77c1bfdd-ed70-4894-b5c5-7e973c7793ec";

/** Notify. Helmet -> app: [Action: 1B]. */
export const CALL_ACTION_CHAR_UUID = "1f221721-edb9-4bd8-b18b-df997197e3d0";

/** Notify: [1 = toggle push-to-talk]. Optional on older firmware. */
export const PTT_CHAR_UUID = "f2f8a3d0-0b35-4c68-a951-5cdf7473f001";
