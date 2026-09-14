import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeSlash,
  LockKey,
  ShieldCheck,
  Spinner,
  PlugsConnected,
  SignOut,
  Trash,
} from "@phosphor-icons/react";
type Connection = {
  leagueId: number;
  teamId: number;
  season: number;
  leagueName: string;
  teamName: string;
  verifiedAt: string;
  teamCount: number;
  revision: string;
};
type Status = {
  ready: boolean;
  authenticated: boolean;
  missing?: string[];
  connection?: Connection | null;
};
const endpoint = "/api/gridiron/connection";
async function call(body?: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The secure connection service is unavailable.");
  return data;
}
function SetupKeys() {
  const owner = useRef<HTMLInputElement>(null),
    encryption = useRef<HTMLInputElement>(null);
  const [generated, setGenerated] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const clear = () => {
      if (owner.current) owner.current.value = "";
      if (encryption.current) encryption.current.value = "";
    };
    window.addEventListener("pagehide", clear);
    return () => {
      clear();
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  const generate = () => {
    const random = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    if (owner.current && encryption.current) {
      owner.current.value = random();
      encryption.current.value = random();
      setGenerated(true);
      setNotice(
        "Two independent keys generated on this device. Save both in your password manager.",
      );
    }
  };
  const copy = async (input: HTMLInputElement | null, label: string) => {
    try {
      await navigator.clipboard.writeText(input?.value ?? "");
      setNotice(label + " copied. Save it privately and clear your clipboard afterward.");
    } catch {
      input?.focus();
      input?.select();
      setNotice("Clipboard access is unavailable. Select and copy the key manually.");
    }
  };
  return (
    <details className="ge-key-helper">
      <summary>One-time hosting setup</summary>
      <ol>
        <li>Open this website in your Higgsfield dashboard, then open its secret settings.</li>
        <li>Create the two named secrets below. Keep a private copy in your password manager.</li>
        <li>Deploy the website again to activate the secrets, then refresh this page.</li>
      </ol>
      <p>
        Already saved these hosting keys? Reuse them. Generating new keys does not update your
        hosting settings; replacing an encryption key makes old saved credentials unreadable.
      </p>
      <button className="ge-button secondary" onClick={generate}>
        {generated ? "Generate replacement keys" : "Generate two keys on this device"}
      </button>
      <div className="ge-key-fields">
        <label htmlFor="generated-owner">OWNER_ACCESS_KEY</label>
        <div className="ge-copy-field">
          <input
            id="generated-owner"
            ref={owner}
            type="password"
            readOnly
            autoComplete="off"
            placeholder="Not generated"
            spellCheck={false}
          />
          <button
            className="ge-icon"
            disabled={!generated}
            onClick={() => void copy(owner.current, "Owner key")}
            aria-label="Copy owner key"
          >
            <Copy size={21} />
          </button>
        </div>
        <label htmlFor="generated-encryption">CREDENTIAL_ENCRYPTION_KEY</label>
        <div className="ge-copy-field">
          <input
            id="generated-encryption"
            ref={encryption}
            type="password"
            readOnly
            autoComplete="off"
            placeholder="Not generated"
            spellCheck={false}
          />
          <button
            className="ge-icon"
            disabled={!generated}
            onClick={() => void copy(encryption.current, "Encryption key")}
            aria-label="Copy encryption key"
          >
            <Copy size={21} />
          </button>
        </div>
      </div>
      <p className="ge-footnote" role="status">
        {notice ||
          "Keys are not sent anywhere by this helper. They disappear when you leave this page."}
      </p>
      <a className="ge-link" href="https://higgsfield.ai" target="_blank" rel="noreferrer">
        Open Higgsfield
        <ArrowUpRight size={18} />
      </a>
    </details>
  );
}
export function Connections() {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [show, setShow] = useState(false),
    [editing, setEditing] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = async () => {
    const next = await call();
    setStatus(next);
    return next as Status;
  };
  useEffect(() => {
    let active = true;
    const clearFields = () => {
      document.querySelectorAll<HTMLInputElement>('.ge-connection-card input[type="password"], .ge-connection-card input[name="swid"], .ge-connection-card input[name="espnS2"]').forEach(input => { input.value = ""; });
    };
    window.addEventListener("pagehide", clearFields);
    void call()
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setError("Could not reach secure setup. Refresh to try again.");
      });
    return () => {
      active = false;
      clearFields();
      window.removeEventListener("pagehide", clearFields);
    };
  }, []);
  const run = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const result = await call({ ...body, action });
      if (action === "login" || action === "logout") {
        await refresh();
        setEditing(false);
        setConfirmDelete(false);
      } else {
        setStatus((previous) =>
          previous ? { ...previous, connection: result.connection } : previous,
        );
        setEditing(false);
        setConfirmDelete(false);
        setMessage(
          action === "disconnect"
            ? "Saved ESPN credentials deleted. Your ESPN account was not changed."
            : action === "save"
              ? "Connection verified and encrypted credentials saved."
              : "ESPN accepted your saved connection.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "TimeoutError"
          ? cause.message
          : "The check timed out. Refresh to confirm the saved connection before retrying.",
      );
      // Refresh metadata on expiry or concurrent changes; never send the secrets again.
      await refresh().catch(() => {});
    } finally {
      setBusy("");
      setShow(false);
    }
  };
  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    const ownerKey = String(values.get("ownerKey") ?? "");
    form.reset();
    void run("login", { ownerKey });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    const body = {
      leagueId: Number(values.get("leagueId")),
      teamId: Number(values.get("teamId")),
      season: Number(values.get("season")),
      swid: String(values.get("swid") ?? ""),
      espnS2: String(values.get("espnS2") ?? ""),
      consent: values.get("consent") === "on",
      revision: status?.connection?.revision ?? null,
    };
    (form.elements.namedItem("swid") as HTMLInputElement).value = "";
    (form.elements.namedItem("espnS2") as HTMLInputElement).value = "";
    void run("save", body);
  };
  const connection = status?.connection;
  const step = !status?.ready || !status.authenticated ? 1 : connection && !editing ? 3 : 2;
  const waiting = !!busy;
  return (
    <div className="ge-connect-page">
      <header className="ge-connect-nav">
        <a href="/app" className="ge-connect-brand">
          <span className="ge-brand-mark">
            G<span>e</span>
          </span>
          <strong>
            gridiron<span>edge</span>
          </strong>
        </a>
        <a className="ge-link" href="/app">
          <ArrowLeft size={18} />
          Back to workspace
        </a>
      </header>
      <main className="ge-connect-main">
        <div className="ge-connect-heading">
          <span className="ge-eyebrow">YOUR PRIVATE WORKSPACE</span>
          <h1>
            Your league.
            <br />
            <span>Securely connected.</span>
          </h1>
          <p>A private, read-only bridge to ESPN. You stay in control of every roster decision.</p>
        </div>
        <ol className="ge-connect-steps" aria-label="Connection progress">
          {["Unlock workspace", "Connect ESPN", "Review connection"].map((name, index) => (
            <li
              key={name}
              className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{step > index + 1 ? <Check size={17} /> : index + 1}</span>
              {name}
            </li>
          ))}
        </ol>
        <div className="ge-connect-grid">
          <section className="ge-card ge-connection-card" aria-busy={waiting}>
            <div className="ge-connection-top">
              <span className="ge-connection-icon">
                <ShieldCheck size={27} />
              </span>
              <span className="ge-tag">
                {status?.authenticated ? "OWNER UNLOCKED" : "OWNER ONLY"}
              </span>
            </div>
            {error && (
              <div className="ge-connect-alert error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="ge-connect-alert" role="status">
                {message}
              </div>
            )}
            {!status && (
              <>
                <h2>Checking secure setup</h2>
                <p>No credentials are needed until the security checks pass.</p>
                {error ? (
                  <button className="ge-button secondary" onClick={() => window.location.reload()}>
                    Retry secure setup
                  </button>
                ) : (
                  <Spinner className="ge-spin" size={25} aria-label="Loading" />
                )}
              </>
            )}
            {status && !status.ready && (
              <>
                <h2>One security step first.</h2>
                <p>
                  The form stays locked until the hosting keys are configured. No ESPN cookies can
                  be submitted or saved yet.
                </p>
                <div className="ge-connect-alert">
                  Waiting for: {(status.missing ?? ["hosting configuration"]).join(", ")}.
                </div>
                <SetupKeys />
                <button className="ge-button ge-full" onClick={() => window.location.reload()}>
                  I’ve configured and deployed — refresh
                </button>
              </>
            )}
            {status?.ready && !status.authenticated && (
              <>
                <h2>Unlock your workspace</h2>
                <p>
                  Use your Gridiron Edge owner key, not your ESPN password. On a trusted device,
                  access lasts up to seven days.
                </p>
                <form onSubmit={login} autoComplete="off">
                  <label htmlFor="owner-key">Owner access key</label>
                  <input
                    id="owner-key"
                    name="ownerKey"
                    type="password"
                    required
                    maxLength={256}
                    minLength={32}
                    autoComplete="off"
                    placeholder="Paste your private owner key"
                    disabled={waiting}
                    spellCheck={false}
                    autoCapitalize="none"
                  />
                  <button className="ge-button ge-full" disabled={waiting}>
                    {busy === "login" ? (
                      <Spinner className="ge-spin" size={20} />
                    ) : (
                      <LockKey size={20} />
                    )}
                    Unlock workspace
                  </button>
                </form>
                <p className="ge-footnote">
                  Sign out when finished on a shared computer. Your key is cleared from this form on
                  submission.
                </p>
              </>
            )}
            {status?.authenticated && (!connection || editing) && (
              <>
                <h2>{editing ? "Replace ESPN cookies" : "Connect your ESPN league"}</h2>
                <p>
                  {editing
                    ? "The current connection stays saved unless the new credentials pass verification."
                    : "Your league details are prefilled. Paste both saved cookie values below."}
                </p>
                <form onSubmit={save} autoComplete="off">
                  <fieldset disabled={waiting}>
                    <legend className="ge-sr-only">ESPN connection details</legend>
                    <div className="ge-id-fields">
                      <label>
                        League ID
                        <input
                          name="leagueId"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={999999999999}
                          required
                          defaultValue={connection?.leagueId ?? 10309566}
                        />
                      </label>
                      <label>
                        Team ID
                        <input
                          name="teamId"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10000}
                          required
                          defaultValue={connection?.teamId ?? 25}
                        />
                      </label>
                      <label>
                        Season
                        <input
                          name="season"
                          type="number"
                          inputMode="numeric"
                          min={2018}
                          max={new Date().getUTCFullYear() + 1}
                          required
                          defaultValue={connection?.season ?? 2026}
                        />
                      </label>
                    </div>
                    <div className="ge-secret-label">
                      <label htmlFor="swid">SWID</label>
                      <button
                        type="button"
                        className="ge-link"
                        onClick={() => setShow(!show)}
                        aria-pressed={show}
                      >
                        {show ? <EyeSlash size={18} /> : <Eye size={18} />}{" "}
                        {show ? "Hide values" : "Show values"}
                      </button>
                    </div>
                    <input
                      id="swid"
                      name="swid"
                      type={show ? "text" : "password"}
                      required
                      maxLength={38}
                      minLength={36}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                    />
                    <label htmlFor="espn-s2">espn_s2</label>
                    <input
                      id="espn-s2"
                      name="espnS2"
                      type={show ? "text" : "password"}
                      required
                      minLength={10}
                      maxLength={8192}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Paste the complete cookie value"
                    />
                    <p id="cookie-help" className="ge-footnote">
                      Paste values only. Never paste your ESPN password. These session cookies can
                      grant account access — treat them like passwords.
                    </p>
                    <label className="ge-consent">
                      <input name="consent" type="checkbox" required />
                      <span>
                        Allow a read-only ESPN check and encrypted storage of these cookies for this
                        private app.
                      </span>
                    </label>
                    <button className="ge-button ge-full">
                      {busy === "save" ? (
                        <Spinner className="ge-spin" size={20} />
                      ) : (
                        <PlugsConnected size={20} />
                      )}{" "}
                      {busy === "save" ? "Verifying with ESPN…" : "Verify & save connection"}
                    </button>
                  </fieldset>
                </form>
                {editing && (
                  <button
                    className="ge-link ge-spaced"
                    disabled={waiting}
                    onClick={() => {
                      setEditing(false);
                      setShow(false);
                    }}
                  >
                    Cancel replacement
                  </button>
                )}
                <a
                  className="ge-link ge-spaced"
                  href="https://fantasy.espn.com/football/team?leagueId=10309566&teamId=25&seasonId=2026"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open my ESPN team
                  <ArrowUpRight size={18} />
                </a>
              </>
            )}
            {status?.authenticated && connection && !editing && (
              <>
                <h2>ESPN connection saved.</h2>
                <p className="ge-connected-name">{connection.leagueName}</p>
                <dl className="ge-system">
                  <div>
                    <dt>Your team</dt>
                    <dd>{connection.teamName}</dd>
                  </div>
                  <div>
                    <dt>League / team</dt>
                    <dd>
                      {connection.leagueId} / {connection.teamId}
                    </dd>
                  </div>
                  <div>
                    <dt>Season</dt>
                    <dd>{connection.season}</dd>
                  </div>
                  <div>
                    <dt>Last verified</dt>
                    <dd>{new Date(connection.verifiedAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Credential storage</dt>
                    <dd>Encrypted · cannot be viewed</dd>
                  </div>
                </dl>
                <button
                  className="ge-button ge-full"
                  disabled={waiting}
                  onClick={() => void run("test", { revision: connection.revision })}
                >
                  {busy === "test" ? (
                    <Spinner className="ge-spin" size={20} />
                  ) : (
                    <ShieldCheck size={20} />
                  )}
                  Test saved connection
                </button>
                <div className="ge-connection-controls">
                  <button className="ge-link" disabled={waiting} onClick={() => setEditing(true)}>
                    Replace cookies
                  </button>
                  <button
                    className="ge-link ge-danger"
                    disabled={waiting}
                    onClick={() => setConfirmDelete(!confirmDelete)}
                  >
                    <Trash size={18} />
                    Disconnect
                  </button>
                </div>
                {confirmDelete && (
                  <div className="ge-connect-alert error">
                    <strong>Delete this app’s saved credentials?</strong>
                    <p>
                      This removes the saved connection. It does not revoke the cookies at ESPN or
                      alter your roster. You will need to paste cookies again to reconnect.
                    </p>
                    <div className="ge-actions">
                      <button
                        className="ge-button"
                        disabled={waiting}
                        onClick={() =>
                          void run("disconnect", { confirm: true, revision: connection.revision })
                        }
                      >
                        Delete saved credentials
                      </button>
                      <button
                        className="ge-button secondary"
                        disabled={waiting}
                        onClick={() => setConfirmDelete(false)}
                      >
                        Keep connection
                      </button>
                    </div>
                  </div>
                )}
                <div className="ge-connect-alert">
                  <strong>Connection ready. Live dashboard still pending.</strong>
                  <p>
                    This screen verifies and stores access. The workspace still shows fictional
                    sample data; continuous sync, injury monitoring and alerts are not running.
                  </p>
                </div>
              </>
            )}
            {status?.authenticated && (
              <button
                className="ge-link ge-signout"
                disabled={waiting}
                onClick={() => void run("logout")}
              >
                <SignOut size={19} />
                Sign out of this device
              </button>
            )}
          </section>
          <aside className="ge-connect-aside">
            <span className="ge-eyebrow">BUILT AROUND YOUR CONTROL</span>
            <h2>
              Less setup.
              <br />
              Clear boundaries.
            </h2>
            <ul>
              <li>
                <LockKey size={22} />
                <div>
                  <strong>Only you can connect</strong>
                  <p>
                    An owner key protects this screen. No public signup or first-visitor access.
                  </p>
                </div>
              </li>
              <li>
                <ShieldCheck size={22} />
                <div>
                  <strong>Encrypted on the server</strong>
                  <p>
                    AES-256-GCM protects saved cookies. The encryption key stays outside the
                    database.
                  </p>
                </div>
              </li>
              <li>
                <Check size={22} />
                <div>
                  <strong>No automatic transactions</strong>
                  <p>
                    Connection checks only read ESPN. Lineups, trades and waiver claims stay in your
                    hands.
                  </p>
                </div>
              </li>
            </ul>
            <div className="ge-connect-note">
              <span className="ge-eyebrow">GOOD TO KNOW</span>
              <p>
                ESPN access is unofficial. Cookies can expire, so occasional replacement may be
                necessary.
              </p>
              <p>No LLM is called for login, encryption or connection checks.</p>
            </div>
          </aside>
        </div>
        <footer className="ge-connect-footer">
          Private workspace · Not affiliated with ESPN · Never share cookies in chat
        </footer>
      </main>
    </div>
  );
}
