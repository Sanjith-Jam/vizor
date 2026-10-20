import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Database,
  ShieldCheck,
  Users,
  MapPin,
  Radio,
  History,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  ADMIN_PERMISSIONS,
  ADMIN_RESOURCES,
  adminChanges,
  type AdminContext,
  type AdminRow,
  type AdminRows,
} from "../../../shared/admin";
import "./admin.css";
const request = <T,>(
  operation: string,
  payload: object = {},
  signal?: AbortSignal,
) => api<T>("admin", { operation, ...payload }, signal);
const format = (key: string, value: unknown) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : typeof value === "object"
        ? JSON.stringify(value)
        : /(_at|_seen)$/.test(key)
          ? new Date(String(value)).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
              timeStyle: "short",
            })
          : String(value);
const label = (key: string) => key.replaceAll("_", " ");
type Confirmation = {
  title: string;
  detail: string;
  operation: string;
  payload: AdminRow;
};
type Editor = {
  resource: string;
  row: AdminRow | null;
  values: Record<string, string>;
};
export function AdminPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") || "overview";
  const [context, setContext] = useState<AdminContext | null>(null),
    [contextError, setContextError] = useState("");
  const [rows, setRows] = useState<AdminRows | null>(null),
    [stats, setStats] = useState<Record<string, number | null>>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [committedQuery, setCommittedQuery] = useState(""),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [dataset, setDataset] = useState("observations"),
    [role, setRole] = useState("admin"),
    [matrix, setMatrix] = useState<{ role: string; permission: string }[]>([]),
    [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [inspected, setInspected] = useState<AdminRow | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [modalError, setModalError] = useState(""),
    [evidence, setEvidence] = useState(""),
    [evidenceBusy, setEvidenceBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const resource = section === "database" ? dataset : section;
  const config = ADMIN_RESOURCES[resource];
  const has = (p: string) => !!context?.permissions.includes(p as never);
  const canEdit = !!config?.write && has(config.write);
  const refresh = () => setRevision((n) => n + 1);
  useEffect(() => {
    const c = new AbortController();
    request<AdminContext>("context", {}, c.signal)
      .then(setContext)
      .catch((e) => {
        if (!c.signal.aborted) setContextError(e.message);
      });
    return () => c.abort();
  }, []);
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!context?.permissions.length) return;
      const seq = ++generation.current;
      setLoading(true);
      setError("");
      try {
        if (section === "overview") {
          const data = await request<Record<string, number | null>>(
            "overview",
            {},
            signal,
          );
          if (seq === generation.current) setStats(data);
        } else if (section === "permissions") {
          const data = await request<{ role: string; permission: string }[]>(
            "permissions",
            {},
            signal,
          );
          if (seq === generation.current) setMatrix(data);
        } else {
          const data = await request<AdminRows>(
            "list",
            { resource, query: committedQuery, page },
            signal,
          );
          if (seq === generation.current) setRows(data);
        }
      } catch (e) {
        if (!signal.aborted && seq === generation.current)
          setError((e as Error).message);
      } finally {
        if (!signal.aborted && seq === generation.current) setLoading(false);
      }
    },
    [context, section, resource, committedQuery, page, revision],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => {
      c.abort();
      generation.current++;
    };
  }, [load]);
  useEffect(
    () =>
      setSelectedPermissions(
        matrix
          .filter((p) => p.role === role)
          .map((p) => p.permission)
          .sort(),
      ),
    [role, matrix],
  );
  const open = !!(inspected || editor || confirmation);
  useEffect(() => {
    const d = dialog.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);
  useEffect(() => {
    if (editor && !confirmation)
      dialog.current?.querySelector<HTMLElement>("input,select")?.focus();
    else if (confirmation)
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [editor?.row, editor?.resource, confirmation]);
  function close() {
    if (saving) return;
    setInspected(null);
    setEditor(null);
    setConfirmation(null);
    setModalError("");
    setEvidence("");
  }
  function navigate(next: string) {
    setParams({ section: next });
    setRows(null);
    setPage(0);
    setQuery("");
    setCommittedQuery("");
    setError("");
    setNotice("");
    close();
  }
  function edit(row: AdminRow | null) {
    setInspected(null);
    setModalError("");
    setEvidence("");
    const defaults: AdminRow = row || {
      lat: 12.973,
      lon: 79.145,
      uncertainty_m: 15,
      status: "suspected",
    };
    setEditor({
      resource,
      row,
      values: Object.fromEntries(
        (resource === "users"
          ? ["name", "role", "suspended"]
          : config.fields.map((f) => f.key)
        ).map((k) => [k, defaults[k] == null ? "" : String(defaults[k])]),
      ),
    });
  }
  function prepareSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setModalError("");
    try {
      if (resource === "users") {
        const name = editor.values.name.trim();
        if (!name || name.length > 120)
          throw new Error("Enter a name between 1 and 120 characters.");
        setConfirmation({
          title: "Update user access?",
          detail: `Update ${editor.row?.email}. Role: ${editor.values.role}. App access: ${editor.values.suspended === "true" ? "suspended" : "active"}. Existing data is retained.`,
          operation: "user",
          payload: {
            id: editor.row?.id,
            name,
            role: editor.values.role,
            suspended: editor.values.suspended === "true",
            expectedRole: editor.row?.role,
            expectedSuspended: editor.row?.suspended,
          },
        });
      } else {
        const data = adminChanges(config.fields, editor.values, editor.row);
        setConfirmation({
          title: editor.row
            ? "Save record changes?"
            : "Publish a pothole record?",
          detail:
            resource === "potholes"
              ? "This changes the shared road database visible to riders. Use a known location and the appropriate verification status."
              : "This changes the selected rider’s application data. The previous and new values will be recorded in the audit trail.",
          operation: "save",
          payload: { resource, id: editor.row?.id ?? null, ...data },
        });
      }
    } catch (err) {
      setModalError((err as Error).message);
      (
        e.currentTarget.querySelector<HTMLElement>(":invalid") ||
        e.currentTarget.querySelector<HTMLElement>("input,select")
      )?.focus();
    }
  }
  async function commit() {
    if (!confirmation || saving) return;
    setSaving(true);
    setModalError("");
    try {
      await request(confirmation.operation, confirmation.payload);
      setNotice("Change saved. The audit trail has been updated.");
      setInspected(null);
      setEditor(null);
      setConfirmation(null);
      setEvidence("");
      refresh();
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function showEvidence() {
    if (!inspected) return;
    setEvidenceBusy(true);
    setModalError("");
    try {
      const r = await request<{ signedUrl: string }>("evidence", {
        resource,
        id: inspected.id,
      });
      setEvidence(r.signedUrl);
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setEvidenceBusy(false);
    }
  }
  const nav = [
    { id: "overview", name: "Overview", icon: ShieldCheck, permission: null },
    {
      id: "potholes",
      name: "Potholes",
      icon: MapPin,
      permission: "hazards.read",
    },
    { id: "users", name: "Users", icon: Users, permission: "users.read" },
    { id: "devices", name: "Devices", icon: Radio, permission: "data.read" },
    {
      id: "database",
      name: "Database",
      icon: Database,
      permission: "data.read",
    },
    {
      id: "permissions",
      name: "Role permissions",
      icon: ShieldCheck,
      permission: "roles.manage",
    },
    {
      id: "audit",
      name: "Audit trail",
      icon: History,
      permission: "audit.read",
    },
  ];
  const review: AdminRow = !confirmation
    ? {}
    : confirmation.operation === "save"
      ? (confirmation.payload.changes as AdminRow)
      : confirmation.operation === "user"
        ? {
            name: confirmation.payload.name,
            role: confirmation.payload.role,
            app_access: confirmation.payload.suspended ? "suspended" : "active",
          }
        : confirmation.operation === "setPermissions"
          ? {
              role: confirmation.payload.role,
              permissions: confirmation.payload.permissions,
            }
          : confirmation.operation === "job"
            ? {
                job: confirmation.payload.id,
                command: confirmation.payload.command,
              }
            : {};
  const title =
    section === "overview"
      ? "Control room."
      : section === "permissions"
        ? "Who can do what."
        : section === "database"
          ? "Application data."
          : config?.label || "Administration";
  if (!context)
    return (
      <div className="admin-gate" role={contextError ? "alert" : "status"}>
        <ShieldCheck size={36} />
        <h1>
          {contextError
            ? "Administration unavailable"
            : "Checking your access…"}
        </h1>
        <p>{contextError || "Verifying permissions with the server."}</p>
        <Link to="/dashboard">Return to your dashboard</Link>
        {contextError && (
          <button onClick={() => window.location.reload()}>Try again</button>
        )}
      </div>
    );
  if (!context.permissions.length)
    return (
      <div className="admin-gate">
        <ShieldCheck size={36} />
        <h1>Staff access required.</h1>
        <p>
          Your rider account cannot open the administration console. An owner
          can grant a role.
        </p>
        <Link to="/dashboard">Return to your dashboard</Link>
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          VIZOR<span>CONTROL / 01</span>
        </Link>
        <p className="admin-nav-label">WORKSPACE</p>
        <nav aria-label="Administration">
          {nav
            .filter((n) => !n.permission || has(n.permission))
            .map((n) => (
              <button
                key={n.id}
                aria-current={section === n.id ? "page" : undefined}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                {n.name}
                <ArrowUpRight size={14} />
              </button>
            ))}
        </nav>
        <div className="admin-identity">
          <span className="admin-role">{context.role}</span>
          <strong>{user?.name}</strong>
          <small>{user?.email}</small>
          <Link to="/dashboard">Back to rider dashboard ↗</Link>
        </div>
      </aside>
      <section className="admin-workspace">
        <header className="admin-topline">
          <span>
            <span className="admin-online-dot" />
            LIVE SUPABASE / APPLICATION CONSOLE
          </span>
          <button
            className="admin-button"
            disabled={loading || saving}
            onClick={refresh}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </header>
        <div className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">
              VIZOR ADMINISTRATION / {context.role.toUpperCase()}
            </p>
            <h1>{title}</h1>
            <p>
              Real records. Explicit permissions. Every privileged change
              recorded.
            </p>
          </div>
          {resource === "potholes" && canEdit && (
            <button className="admin-button primary" onClick={() => edit(null)}>
              <Plus size={17} />
              Add pothole
            </button>
          )}
        </div>
        {notice && (
          <p className="admin-message success" role="status">
            {notice}
          </p>
        )}
        {error && (
          <div className="admin-message error" role="alert">
            {error}
            <button className="admin-button" onClick={refresh}>
              Retry
            </button>
          </div>
        )}
        {section === "overview" ? (
          <>
            <div className="admin-stats" aria-busy={loading}>
              {[
                ["Shared potholes", stats.potholes],
                ["Active road reports", stats.activePotholes],
                ["Registered riders", stats.users],
                ["Connected workers", stats.onlineDevices],
                ["Registered devices", stats.devices],
                ["Jobs in progress", stats.queuedJobs],
              ]
                .filter((x) => x[1] !== null)
                .map(([k, v]) => (
                  <article key={String(k)}>
                    <span>{k}</span>
                    <strong>{v ?? "—"}</strong>
                  </article>
                ))}
            </div>
            <div className="admin-overview-grid">
              <article>
                <p className="admin-eyebrow">01 / ROAD INTELLIGENCE</p>
                <h2>Keep the road record useful.</h2>
                <p>
                  Review locations, uncertainty and verification status before
                  making a shared report authoritative.
                </p>
                {has("hazards.read") && (
                  <button
                    className="admin-button"
                    onClick={() => navigate("potholes")}
                  >
                    Review potholes <ArrowUpRight size={16} />
                  </button>
                )}
              </article>
              <article>
                <p className="admin-eyebrow">02 / ACCESS & ACCOUNTABILITY</p>
                <h2>Permission starts on the server.</h2>
                <p>
                  Owners manage roles. Staff receive only their assigned
                  capabilities. Private evidence access is logged and signed
                  links expire after one minute.
                </p>
                <a
                  className="admin-button"
                  target="_blank"
                  rel="noreferrer"
                  href="https://supabase.com/dashboard/project/cybjaycigwzfgtxpnucz"
                >
                  Open Supabase project <ArrowUpRight size={16} />
                </a>
                <small>
                  Infrastructure, backups, billing, Auth providers and SQL
                  remain in the project owner’s Supabase dashboard.
                </small>
              </article>
            </div>
          </>
        ) : section === "permissions" ? (
          <section className="admin-card">
            <div className="admin-toolbar">
              <label>
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {["admin", "moderator", "rider"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <p>
                Owner permissions are fixed. Only an active owner can assign
                roles or change this matrix.
              </p>
            </div>
            <div className="admin-permission-list">
              {ADMIN_PERMISSIONS.filter((p) => p !== "roles.manage").map(
                (p) => (
                  <label key={p}>
                    <span>
                      <strong>{p}</strong>
                      <small>
                        {p.endsWith(".read")
                          ? "View records in this area"
                          : "Change records and access in this area"}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(p)}
                      disabled={loading}
                      onChange={(e) =>
                        setSelectedPermissions((v) =>
                          e.target.checked
                            ? [...v, p]
                            : v.filter((x) => x !== p),
                        )
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <button
              className="admin-button primary"
              disabled={loading}
              onClick={() =>
                setConfirmation({
                  title: "Change role permissions?",
                  detail: `This changes ${role} access for every account with that role, including access to private application data. Existing sessions use the new permissions immediately.`,
                  operation: "setPermissions",
                  payload: {
                    role,
                    permissions: [...selectedPermissions].sort(),
                    expected: matrix
                      .filter((p) => p.role === role)
                      .map((p) => p.permission)
                      .sort(),
                  },
                })
              }
            >
              Save role permissions
            </button>
          </section>
        ) : (
          config && (
            <section className="admin-card admin-records">
              <div className="admin-toolbar">
                {section === "database" && (
                  <label>
                    Dataset
                    <select
                      value={dataset}
                      onChange={(e) => {
                        setDataset(e.target.value);
                        setPage(0);
                        setRows(null);
                        setQuery("");
                        setCommittedQuery("");
                      }}
                    >
                      {Object.entries(ADMIN_RESOURCES)
                        .filter(
                          ([k, v]) =>
                            !["users", "audit", "potholes", "devices"].includes(
                              k,
                            ) && has(v.read),
                        )
                        .map(([k, v]) => (
                          <option value={k} key={k}>
                            {v.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <form
                  noValidate
                  className="admin-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(0);
                    setCommittedQuery(query.trim());
                  }}
                >
                  <label className="sr-only" htmlFor="admin-search">
                    Search {config.label}
                  </label>
                  <Search size={17} />
                  <input
                    ref={search}
                    id="admin-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={100}
                    placeholder={`Search ${config.label.toLowerCase()}`}
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("");
                        setCommittedQuery("");
                        setPage(0);
                        search.current?.focus();
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button type="submit" disabled={loading}>
                    Search
                  </button>
                </form>
                <span>{rows?.total ?? "—"} records</span>
              </div>
              <div className="admin-table-wrap" aria-busy={loading}>
                {loading && (
                  <div className="admin-loading" role="status">
                    Loading records…
                  </div>
                )}
                <table>
                  <caption className="sr-only">
                    {config.label} records, page {page + 1}
                  </caption>
                  <thead>
                    <tr>
                      {config.columns.map((c) => (
                        <th key={c}>{label(c)}</th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading &&
                      rows?.rows.map((r, i) => (
                        <tr key={String(r.id || r.device_id || i)}>
                          {config.columns.map((c) => (
                            <td key={c}>
                              <span
                                className={
                                  ["status", "role"].includes(c)
                                    ? "admin-status"
                                    : ""
                                }
                              >
                                {format(c, r[c])}
                              </span>
                            </td>
                          ))}
                          <td>
                            <button
                              className="admin-button compact"
                              onClick={() => {
                                setInspected(r);
                                setModalError("");
                                setEvidence("");
                              }}
                            >
                              Inspect <ArrowUpRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!loading && rows?.rows.length === 0 && (
                  <div className="admin-empty">
                    <Database size={26} />
                    <h2>No records found.</h2>
                    <p>
                      {committedQuery
                        ? "Try a different search or clear the filter."
                        : "Records will appear here as riders use Vizor."}
                    </p>
                  </div>
                )}
              </div>
              <footer className="admin-pagination">
                <span>
                  Page {page + 1} of{" "}
                  {Math.max(1, Math.ceil((rows?.total || 0) / 25))}
                </span>
                <div>
                  <button
                    className="admin-button compact"
                    disabled={loading || page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <button
                    className="admin-button compact"
                    disabled={loading || !rows || (page + 1) * 25 >= rows.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </footer>
            </section>
          )
        )}
      </section>
      <dialog
        ref={dialog}
        className="admin-dialog"
        aria-labelledby="admin-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <div className="admin-dialog-heading">
          <h2 id="admin-dialog-title">
            {confirmation?.title ||
              (editor
                ? editor.row
                  ? "Edit record"
                  : "Add pothole"
                : "Record details")}
          </h2>
          <button
            className="admin-button compact"
            aria-label="Close dialog"
            disabled={saving}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {modalError && (
          <p
            id="admin-editor-error"
            className="admin-message error"
            role="alert"
          >
            {modalError}
          </p>
        )}
        {confirmation ? (
          <>
            <p>{confirmation.detail}</p>
            <dl className="admin-detail">
              {Object.entries(review).map(([key, value]) => (
                <div key={key}>
                  <dt>{label(key)}</dt>
                  <dd>{format(key, value)}</dd>
                </div>
              ))}
            </dl>
            <p className="admin-confirm-note">
              Only the listed change will be applied. This operation is recorded
              with your account identity.
            </p>
            <div className="admin-dialog-actions">
              <button
                className="admin-button"
                disabled={saving}
                onClick={() => {
                  setConfirmation(null);
                  setModalError("");
                }}
              >
                Go back
              </button>
              <button
                className="admin-button primary"
                disabled={saving}
                onClick={() => void commit()}
              >
                {saving ? "Saving…" : "Confirm change"}
              </button>
            </div>
          </>
        ) : editor ? (
          <form
            noValidate
            aria-describedby={modalError ? "admin-editor-error" : undefined}
            onSubmit={prepareSave}
          >
            {resource === "users" ? (
              <>
                <label className="admin-field">
                  Display name
                  <input
                    maxLength={120}
                    value={editor.values.name}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        values: { ...editor.values, name: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="admin-field">
                  Role
                  <select
                    disabled={!has("roles.manage")}
                    value={editor.values.role}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        values: { ...editor.values, role: e.target.value },
                      })
                    }
                  >
                    {["owner", "admin", "moderator", "rider"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    disabled={editor.row?.id === user?.id}
                    checked={editor.values.suspended === "true"}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        values: {
                          ...editor.values,
                          suspended: String(e.target.checked),
                        },
                      })
                    }
                  />
                  Suspend app access (retains data)
                </label>
                <p>
                  Role and suspension changes take effect on the next request.
                  The last active owner is protected.
                </p>
              </>
            ) : (
              config.fields.map((f) => (
                <label className="admin-field" key={f.key}>
                  {f.label}
                  {f.nullable && <small>Optional · blank means unknown</small>}
                  {f.type === "select" ? (
                    <select
                      value={editor.values[f.key]}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [f.key]: e.target.value },
                        })
                      }
                    >
                      {f.choices?.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      step="any"
                      min={f.min}
                      max={f.max}
                      maxLength={f.type === "text" ? 200 : undefined}
                      value={editor.values[f.key]}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [f.key]: e.target.value },
                        })
                      }
                    />
                  )}
                </label>
              ))
            )}
            <div className="admin-dialog-actions">
              <button type="button" className="admin-button" onClick={close}>
                Cancel
              </button>
              <button className="admin-button primary" type="submit">
                Review changes
              </button>
            </div>
          </form>
        ) : (
          inspected && (
            <>
              <dl className="admin-detail">
                {Object.entries(inspected).map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd>
                      {typeof v === "object" && v !== null ? (
                        <pre>{JSON.stringify(v, null, 2)}</pre>
                      ) : (
                        format(k, v)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {evidence && (
                <div>
                  <img
                    className="admin-evidence"
                    src={evidence}
                    alt="Private road evidence"
                  />
                  <small>
                    Private signed image · link expires after one minute.
                  </small>
                </div>
              )}
              <div className="admin-dialog-actions">
                {canEdit &&
                  (config.fields.length > 0 || resource === "users") && (
                    <button
                      className="admin-button primary"
                      onClick={() => edit(inspected)}
                    >
                      Edit record
                    </button>
                  )}
                {["observations", "inference_jobs"].includes(resource) &&
                  has("data.read") && (
                    <button
                      className="admin-button"
                      disabled={evidenceBusy}
                      onClick={() => void showEvidence()}
                    >
                      {evidenceBusy ? "Opening…" : "View private evidence"}
                    </button>
                  )}
                {resource === "devices" &&
                  has("devices.manage") &&
                  !inspected.credential_revoked && (
                    <button
                      className="admin-button danger"
                      onClick={() =>
                        setConfirmation({
                          title: "Revoke this device credential?",
                          detail: `${inspected.name} will stop claiming photos and sending telemetry. Its rider must register and provision a new credential to reconnect it. Existing data remains.`,
                          operation: "deviceRevoke",
                          payload: { id: inspected.id },
                        })
                      }
                    >
                      Revoke device
                    </button>
                  )}
                {resource === "inference_jobs" &&
                  has("data.write") &&
                  ["queued", "processing", "failed", "cancelled"].includes(
                    String(inspected.status),
                  ) && (
                    <button
                      className="admin-button"
                      onClick={() =>
                        setConfirmation({
                          title: "Change photo job state?",
                          detail:
                            "The server checks the current state and fences old worker results. No completed result is overwritten.",
                          operation: "job",
                          payload: {
                            id: inspected.id,
                            expectedStatus: inspected.status,
                            command: ["failed", "cancelled"].includes(
                              String(inspected.status),
                            )
                              ? "retry"
                              : "cancel",
                          },
                        })
                      }
                    >
                      {["failed", "cancelled"].includes(
                        String(inspected.status),
                      )
                        ? "Retry job"
                        : "Cancel job"}
                    </button>
                  )}
              </div>
            </>
          )
        )}
      </dialog>
    </div>
  );
}
