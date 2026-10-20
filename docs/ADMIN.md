# Administration

Open [Vizor administration](https://vizor-connected-riding.astute-jay-0484.chatgpt.site/admin) while signed in with a permitted account. The menu includes Administration for staff. The console manages the application's Supabase records; infrastructure, backups, billing, Auth providers and SQL remain in the Supabase project dashboard.

## Roles and permissions

Role assignments live in `app_access`, not editable user metadata or JWT role labels. `app_role_permissions` defines capabilities. Every administrative RPC checks the current database assignment on every request; hiding a client control is not authorization.

- **Owner:** every application capability; manages role assignments and permission matrices. The last active owner cannot be demoted or suspended. An owner cannot suspend their own account.
- **Admin:** all default application data, device, user and audit capabilities. Cannot assign roles, change role permissions, or manage an owner/admin account.
- **Moderator:** reads and edits shared potholes by default. Private rider data is unavailable.
- **Rider:** no administration capabilities by default. Normal user-scoped app functions remain available.

Owners can edit the admin, moderator and rider matrices. Granting data or user capabilities exposes the associated private records to that role; the confirmation dialog names that scope. Owner capabilities and `roles.manage` remain fixed. Permissions take effect on the next server request, including existing sessions.

Initial owner creation is a privileged, one-time database operation after verifying the user's confirmed Auth UUID. Apply `202610200001_admin_console.sql`, then insert that UUID into `app_access` with role `owner` and record `owner.bootstrap` in `admin_audit`. Never bootstrap from a client-editable email/name field or put service credentials in the browser/APK. Subsequent assignments use the console.

## Workflows

- Overview: actual pothole, rider, worker and queue counts, constrained by permissions.
- Potholes: search, inspect, create and edit location, uncertainty and verification status. Changes affect the shared road database. Sensor sightings remain factual counts.
- Users: search verified/unverified Auth accounts; edit display names, assign roles as owner, suspend or restore application access. Suspension retains data and prevents API calls, direct authenticated queries and device writes. It does not delete the Auth identity or change provider settings.
- Devices: inspect health/model/owner, rename, or revoke a credential. Revocation stops that credential; reconnecting requires fresh registration and provisioning. Tokens and token hashes are never returned by the console.
- Database: paginated, searchable views of observations, photo jobs, rides, contacts, telemetry, confirmations, sensor events and request budgets. Controlled editors correct observation location/confidence, ride summaries and contacts. Machine events and request counters are read-only; jobs have state-checked cancel/retry controls with existing lease fencing. No arbitrary SQL endpoint is exposed.
- Evidence: explicit private image access from observations/photo jobs, signed for 60 seconds and audited. No evidence is made public.
- Audit: actor, operation, resource, record and before/after values for changes; private dataset reads and evidence opens are recorded. Clients cannot alter the audit table.

Editors retain user input on errors and check the original edited field values before saving, so concurrent changes cause a reload prompt instead of silent overwrites. Role updates use a transaction lock to protect last-owner checks. User deletion and bulk purges are not provided: suspension and existing job lifecycle controls preserve records and references.

## Verification

`npm test` covers edit payload boundaries. Run `supabase/tests/admin_console.sql` through an owner SQL connection against a migrated database; fixtures, role assignments and test mutations roll back. It exercises anonymous/rider/moderator/admin/owner authorization, untrusted metadata, private evidence denial, role updates, last-owner protection, column allowlists, stale writes, suspension, credential revocation and audits. Never remove the enclosing transaction/rollback when using a real project.
