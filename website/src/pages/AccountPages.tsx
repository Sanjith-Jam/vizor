import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowUpRight, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { api } from "../lib/api";
import { SosContactsManager } from "../components/SosContactsManager";
export function AuthPage() {
  const path = useLocation().pathname,
    signup = path === "/signup",
    reset = path === "/reset-password";
  const { signIn, signUp, resetPassword, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!e.currentTarget.checkValidity()) {
      setError(
        "Complete the required fields with a valid email and a password of at least 8 characters.",
      );
      e.currentTarget.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    setBusy(true);
    try {
      if (!isSupabaseConfigured)
        throw new Error(
          "Live accounts are not configured yet. Explore the demo while service setup is pending.",
        );
      const result = reset
        ? await updatePassword(password)
        : signup
          ? await signUp(email, password, name)
          : await signIn(email, password);
      if (result.error) throw new Error(result.error);
      const session = await supabase!.auth.getSession();
      if (session.data.session) {
        const redirect = new URLSearchParams(window.location.search).get(
          "redirect",
        );
        navigate(
          redirect && redirect.startsWith("/") && !redirect.startsWith("//")
            ? redirect
            : "/dashboard",
        );
      } else setNotice("Check your email to confirm your account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="simple-page">
      <span className="eyebrow">VIZOR / YOUR CONNECTED JOURNEY</span>
      <h1>
        {reset ? "A FRESH START." : signup ? "MAKE IT YOURS." : "WELCOME BACK."}
      </h1>
      <form className="account-form" noValidate onSubmit={submit}>
        {signup && (
          <label>
            Your name
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}
        {!reset && (
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          {reset ? "New password" : "Password"}
          <input
            type="password"
            autoComplete={signup || reset ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && (
          <div role="alert" className="error-note">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="info-note">
            {notice}
          </div>
        )}
        <button disabled={busy} className="primary-button">
          {busy
            ? "One moment…"
            : reset
              ? "Update password"
              : signup
                ? "Create account"
                : "Sign in"}
          <ArrowUpRight size={18} />
        </button>
      </form>
      <div className="account-links">
        <Link to={signup ? "/login" : "/signup"}>
          {signup ? "Already have an account?" : "Create an account"}
        </Link>
        <Link to="/demo">Explore the demo</Link>
      </div>
      {!signup && !reset && (
        <button
          className="text-link"
          style={{ background: "none", color: "inherit", marginTop: 25 }}
          onClick={async () => {
            if (!email) {
              setError("Enter your email address first.");
              return;
            }
            const r = await resetPassword(email);
            r.error
              ? setError(r.error)
              : setNotice(
                  "If an account exists, a password reset email is on its way.",
                );
          }}
        >
          Forgot your password?
        </button>
      )}
    </section>
  );
}
export function AccountPage() {
  const { user, signOut } = useAuth();
  const [devices, setDevices] = useState<any[]>([]),
    [deviceName, setDeviceName] = useState("My Vizor helmet"),
    [credential, setCredential] = useState<any>(null),
    [error, setError] = useState(""),
    [rides, setRides] = useState<any[]>([]);
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("devices")
      .select("id,name,created_at")
      .then(({ data, error }) => {
        setDevices(data || []);
        if (error) setError(error.message);
      });
    void supabase
      .from("ride_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setRides(data || []));
  }, [credential]);
  return (
    <section className="simple-page">
      <span className="eyebrow">VIZOR / PROFILE</span>
      <h1>YOUR CONNECTION.</h1>
      <p>
        {user?.name} · {user?.email}
      </p>
      <div className="account-panel">
        <div>
          <h2>Cloud-connected helmets</h2>
          <p>
            Register the Banana Pi as a device. Its token is shown once; store
            it locally on the Pi, never in source control.
          </p>
          <form
            className="search-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                setCredential(
                  await api("registerDevice", { name: deviceName }),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <input
              aria-label="Helmet name"
              value={deviceName}
              maxLength={80}
              required
              onChange={(e) => setDeviceName(e.target.value)}
            />
            <button className="icon-button" aria-label="Register helmet">
              <ArrowUpRight size={18} />
            </button>
          </form>
          {credential && (
            <div className="device-credential">
              Device ID: {credential.id}
              <br />
              Device token: {credential.token}
              <br />
              Copy this token now. It will not be displayed again.
            </div>
          )}
          {error && (
            <div role="alert" className="error-note">
              {error}
            </div>
          )}
          {devices.map((d) => (
            <div className="list-entry" key={d.id}>
              <span>{d.name}</span>
              <small>{d.id.slice(0, 8)}</small>
            </div>
          ))}
          <h2>Ride history</h2>
          {rides.length ? (
            rides.map((r) => (
              <div className="list-entry" key={r.id}>
                <span>{r.destination || "Open ride"}</span>
                <small>{new Date(r.started_at).toLocaleDateString()}</small>
              </div>
            ))
          ) : (
            <p>Your completed live rides will appear here.</p>
          )}
          <button
            className="primary-button"
            style={{ marginTop: 30 }}
            onClick={() => void signOut()}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
        <div>
          <h2>Emergency contacts</h2>
          <SosContactsManager />
        </div>
      </div>
    </section>
  );
}
export function DownloadPage() {
  const url = import.meta.env.VITE_ANDROID_APK_URL;
  return (
    <section className="simple-page">
      <span className="eyebrow">VIZOR / ANDROID COMPANION</span>
      <h1>
        TAKE IT
        <br />
        WITH YOU.
      </h1>
      <p>
        Destination search, your helmet connection, shared road intelligence,
        and push-to-talk assistance. One focused companion for the journey.
      </p>
      {url ? (
        <>
          <a className="primary-button" href={url}>
            Download Android APK <ArrowUpRight size={18} />
          </a>
          <p className="info-note">
            This prototype release is in a private GitHub repository. Sign in to
            GitHub with an account that has access to download it.
          </p>
        </>
      ) : (
        <p className="info-note">
          The Android release is not available from this deployment yet.
        </p>
      )}
      <Link className="text-link" to="/demo">
        Explore the experience <ArrowUpRight size={18} />
      </Link>
    </section>
  );
}
export function PrivacyPage() {
  return (
    <section className="simple-page">
      <span className="eyebrow">VIZOR / PRIVACY & DATA</span>
      <h1>
        YOUR DATA.
        <br />
        YOUR JOURNEY.
      </h1>
      <p>
        Vizor collects account details, rider-submitted observations, location
        during active rides, and optional road evidence. Your trips, device
        credentials, emergency contacts, and raw evidence are private to your
        account.
      </p>
      <p>
        The shared pothole map displays approximate hazard locations, sightings,
        and verification states without exposing rider identities. Replay data
        is clearly labeled and excluded from live pothole records.
      </p>
      <p>
        Voice requests are recorded only when you activate push-to-talk. Audio
        and supplied route context are sent to Google Gemini to process your
        request. Audio is not retained by the Vizor backend. Google service data
        handling follows your configured Gemini account terms.
      </p>
      <p>
        Interactive maps use Google Maps. Destination searches and route
        endpoints are sent to Google Places and Routes through the authenticated
        backend. Google’s service terms and privacy policy apply. Recorded
        sample data is labeled separately. See{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Google’s privacy policy
        </a>
        .
      </p>
      <p>
        Vizor is a prototype, with incomplete road coverage and approximate
        observations. It does not certify road safety. The deployment owner must
        supply contact details and retention/deletion procedures before a public
        launch.
      </p>
    </section>
  );
}
