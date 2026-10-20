export const ADMIN_PERMISSIONS = [
  "hazards.read",
  "hazards.write",
  "users.read",
  "users.write",
  "roles.manage",
  "data.read",
  "data.write",
  "devices.manage",
  "audit.read",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
export type AdminRole = "owner" | "admin" | "moderator" | "rider";
export type AdminContext = { role: AdminRole; permissions: AdminPermission[] };
export type AdminRow = Record<string, unknown>;
export type AdminRows = {
  rows: AdminRow[];
  total: number;
  page: number;
  pageSize: number;
};
export type AdminField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  nullable?: boolean;
  choices?: string[];
  min?: number;
  max?: number;
};
export const ADMIN_RESOURCES: Record<
  string,
  {
    label: string;
    read: AdminPermission;
    write?: AdminPermission;
    columns: string[];
    fields: AdminField[];
  }
> = {
  potholes: {
    label: "Potholes",
    read: "hazards.read",
    write: "hazards.write",
    columns: ["id", "status", "lat", "lon", "sightings", "last_seen"],
    fields: [
      { key: "lat", label: "Latitude", type: "number", min: -90, max: 90 },
      { key: "lon", label: "Longitude", type: "number", min: -180, max: 180 },
      {
        key: "uncertainty_m",
        label: "Location uncertainty (m)",
        type: "number",
        min: 0,
        max: 10000,
      },
      {
        key: "status",
        label: "Verification status",
        type: "select",
        choices: ["suspected", "corroborated", "disputed", "repaired"],
      },
    ],
  },
  users: {
    label: "Users",
    read: "users.read",
    write: "users.write",
    columns: ["email", "name", "role", "suspended", "last_sign_in_at"],
    fields: [],
  },
  devices: {
    label: "Devices",
    read: "data.read",
    write: "devices.manage",
    columns: ["name", "user_id", "worker_seen_at", "credential_revoked"],
    fields: [{ key: "name", label: "Device name", type: "text" }],
  },
  observations: {
    label: "Observations",
    read: "data.read",
    write: "data.write",
    columns: ["event_id", "source", "confidence", "lat", "lon", "user_id"],
    fields: [
      {
        key: "lat",
        label: "Latitude",
        type: "number",
        min: -90,
        max: 90,
        nullable: true,
      },
      {
        key: "lon",
        label: "Longitude",
        type: "number",
        min: -180,
        max: 180,
        nullable: true,
      },
      {
        key: "accuracy_m",
        label: "Fix accuracy (m)",
        type: "number",
        min: 0,
        max: 10000,
        nullable: true,
      },
      {
        key: "confidence",
        label: "Confidence (0–1)",
        type: "number",
        min: 0,
        max: 1,
        nullable: true,
      },
    ],
  },
  inference_jobs: {
    label: "Photo jobs",
    read: "data.read",
    write: "data.write",
    columns: ["id", "status", "mode", "attempts", "created_at"],
    fields: [],
  },
  ride_sessions: {
    label: "Rides",
    read: "data.read",
    write: "data.write",
    columns: ["id", "destination", "distance_m", "started_at", "user_id"],
    fields: [
      {
        key: "destination",
        label: "Destination",
        type: "text",
        nullable: true,
      },
      { key: "distance_m", label: "Distance (m)", type: "number", min: 0 },
      { key: "hazard_count", label: "Hazard count", type: "number", min: 0 },
    ],
  },
  sos_contacts: {
    label: "Emergency contacts",
    read: "data.read",
    write: "data.write",
    columns: ["name", "phone", "user_id"],
    fields: [
      { key: "name", label: "Contact name", type: "text" },
      { key: "phone", label: "Phone number", type: "text" },
    ],
  },
  helmet_telemetry: {
    label: "Helmet telemetry",
    read: "data.read",
    columns: ["device_id", "recorded_at", "camera", "gps", "battery_percent"],
    fields: [],
  },
  hazard_reports: {
    label: "Rider confirmations",
    read: "data.read",
    columns: ["pothole_id", "report", "recorded_at", "user_id"],
    fields: [],
  },
  hazard_logs: {
    label: "Sensor events",
    read: "data.read",
    columns: ["id", "g_force", "has_gps_fix", "recorded_at"],
    fields: [],
  },
  request_budgets: {
    label: "API request budgets",
    read: "data.read",
    columns: ["user_id", "kind", "bucket", "count"],
    fields: [],
  },
  audit: {
    label: "Audit trail",
    read: "audit.read",
    columns: ["created_at", "actor_id", "action", "resource", "record_id"],
    fields: [],
  },
};
export function adminChanges(
  fields: AdminField[],
  values: Record<string, string>,
  original: AdminRow | null,
) {
  const changes: AdminRow = {},
    expected: AdminRow = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();
    let value: unknown = raw;
    if (!raw && field.nullable) value = null;
    else if (!raw) throw new Error(`${field.label} is required.`);
    else if (field.type === "number") {
      value = Number(raw);
      if (
        !Number.isFinite(value) ||
        (field.min !== undefined && Number(value) < field.min) ||
        (field.max !== undefined && Number(value) > field.max)
      )
        throw new Error(`${field.label} is outside its allowed range.`);
    } else if (field.choices && !field.choices.includes(raw))
      throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
    if (!original || value !== original[field.key]) {
      changes[field.key] = value;
      expected[field.key] = original?.[field.key] ?? null;
    }
  }
  if (!Object.keys(changes).length) throw new Error("No changes to save.");
  return { changes, expected };
}
