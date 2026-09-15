import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  House,
  UsersThree,
  MagnifyingGlass,
  ArrowsLeftRight,
  Bell,
  GearSix,
  Star,
  ArrowUpRight,
  Lightning,
  ShieldCheck,
  X,
  ArrowClockwise,
  ChartLineUp,
  Clock,
  DownloadSimple,
  SignOut,
} from "@phosphor-icons/react";
import {
  backtest,
  bestLineup,
  forecast,
  isHeld,
  projectedTotal,
  starters,
  waiverOptions,
  type LeaguePlayer,
  type Preferences,
  type WorkspaceData,
} from "../../lib/football";
import { DecisionQueue, AdvisorSettings, useAdvisor } from "./DecisionQueue";
import { Explain, ownershipText } from "./Explain";
import { PlayerMatchup, PlayerMemory } from "./PlayerContext";
import { PlayerUsage, UsageBadge } from "./PlayerUsage";
import { PlayerPhoto } from "./PlayerPhoto";
import { OpponentDesk } from "./OpponentDesk";
import { managerLabel } from "../../lib/league-intel";
import liveCss from "../../live.css?url";

type Tab =
  | "today"
  | "team"
  | "players"
  | "waivers"
  | "reports"
  | "opponents"
  | "league"
  | "settings"
  | "more";
const nav = [
  { id: "today", title: "Today", icon: House },
  { id: "team", title: "My team", icon: UsersThree },
  { id: "players", title: "Players", icon: MagnifyingGlass },
  { id: "league", title: "League", icon: ChartLineUp },
] as const;
const sectionFor = (tab: Tab) =>
  tab === "opponents" || tab === "reports"
    ? "team"
    : tab === "waivers"
      ? "players"
      : tab === "settings" || tab === "more"
        ? "league"
        : tab;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
const date = (n: string | number | null | undefined) =>
  n
    ? new Date(n).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not available";
const ago = (n: number | null) =>
  !n
    ? "Never"
    : Date.now() - n < 60000
      ? "Just now"
      : Math.round((Date.now() - n) / 60000) + " min ago";
async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/gridiron/workspace", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(body?.action === "sync" ? 90000 : 25000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(value.error ?? "Could not reach your workspace."), {
      status: response.status,
      code: value.code,
    });
  return value;
}
export function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [phase, setPhase] = useState("loading"),
    [tab, setTab] = useState<Tab>("today"),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [position, setPosition] = useState("ALL"),
    [watchOnly, setWatchOnly] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [player, setPlayer] = useState<LeaguePlayer | null>(null),
    [panel, setPanel] = useState<"lineup" | "compare" | null>(null),
    [draft, setDraft] = useState(""),
    [dirty, setDirty] = useState(false),
    [push, setPush] = useState(false),
    [install, setInstall] = useState<any>(null),
    [playerView, setPlayerView] = useState<"overview" | "why" | "news" | "history">("overview"),
    [clock, setClock] = useState(0);
  const epoch = useRef(0),
    dirtyRef = useRef(false),
    active = useRef(true),
    syncing = useRef(false),
    dialog = useRef<HTMLDialogElement>(null);
  const accept = useCallback((value: WorkspaceData, ticket: number) => {
    if (!active.current || ticket !== epoch.current) return;
    setData((previous) =>
      previous?.snapshot?.acquiredAt === value.snapshot?.acquiredAt &&
      previous?.snapshot?.contextUpdatedAt === value.snapshot?.contextUpdatedAt
        ? { ...value, snapshot: previous?.snapshot ?? null }
        : value,
    );
    setPhase("ready");
    if (!dirtyRef.current) setDraft(value.preferences.notes);
  }, []);
  const failure = useCallback((error: any) => {
    if (!active.current) return;
    if (error.status === 401) {
      epoch.current++;
      setData(null);
      setPlayer(null);
      setPanel(null);
      setDraft("");
      dirtyRef.current = false;
      setDirty(false);
      setPhase("locked");
    } else
      setNotice(
        error.name === "TimeoutError"
          ? "The request timed out. Refresh to check its latest status."
          : (error.message ?? "Request failed."),
      );
  }, []);
  const advisor = useAdvisor(
    phase === "ready",
    data?.snapshot
      ? data.snapshot.acquiredAt + ":" + (data.snapshot.contextUpdatedAt ?? 0)
      : undefined,
    data?.preferences.paused,
    failure,
  );
  const refresh = useCallback(async () => {
    const ticket = epoch.current;
    try {
      accept(await api(), ticket);
    } catch (error) {
      failure(error);
      setPhase((p) => (p === "loading" ? "error" : p));
    }
  }, [accept, failure]);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    const ticket = epoch.current;
    setBusy("sync");
    try {
      const r = await api({ action: "sync" });
      accept(r.workspace, ticket);
      if (ticket !== epoch.current) return;
      if (r.error) setNotice(r.error);
      else if (r.synced) setNotice("League data refreshed.");
      else if (r.reason === "paused") setNotice("Resume monitoring in Settings before syncing.");
    } catch (error) {
      failure(error);
    } finally {
      syncing.current = false;
      if (active.current) setBusy("");
    }
  }, [accept, failure]);
  useEffect(() => {
    active.current = true;
    const query = new URLSearchParams(location.search).get("tab");
    if (["today", "team", "players", "waivers", "reports", "opponents", "league", "settings"].includes(query ?? "")) setTab(query as Tab);
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(onVisibility, 60000);
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          if ("PushManager" in window) setPush(!!(await reg.pushManager.getSubscription()));
        })
        .catch(() => {});
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [refresh]);
  useEffect(() => {
    if (
      data?.connected &&
      data.needsSync &&
      !data.preferences.paused &&
      !data.health.running &&
      (data.health.nextAttempt ?? 0) <= Date.now()
    )
      void sync();
  }, [
    data?.connected,
    data?.needsSync,
    data?.preferences.paused,
    data?.health.running,
    data?.health.nextAttempt,
    sync,
  ]);
  useEffect(() => {
    if (player || panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [player, panel]);
  useEffect(() => setPlayerView("overview"), [player?.id]);
  const snapshot = useMemo(
      () =>
        data?.snapshot
          ? {
              ...data.snapshot,
              players: data.snapshot.players.map((p) => ({ ...p, locked: isHeld(p) })),
            }
          : null,
      [data?.snapshot, clock],
    ),
    prefs = data?.preferences;
  useEffect(() => {
    if (!snapshot) return;
    const future = snapshot.players
      .map((p) => (p.kickoff ? Date.parse(p.kickoff) : 0))
      .filter((t) => t > Date.now());
    if (!future.length) return;
    const timer = setTimeout(
      () => setClock((c) => c + 1),
      Math.min(2147483000, Math.max(1, Math.min(...future) - Date.now() + 30)),
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  const roster = useMemo(
    () => snapshot?.players.filter((p) => p.teamId === snapshot.teamId) ?? [],
    [snapshot],
  );
  const current = useMemo(() => (snapshot ? starters(snapshot) : []), [snapshot]),
    best = useMemo(() => (snapshot ? bestLineup(snapshot) : null), [snapshot]);
  const wire = useMemo(() => (snapshot ? waiverOptions(snapshot) : []), [snapshot]);
  const validation = useMemo(() => backtest(roster), [roster]);
  const currentTotal = projectedTotal(current),
    incomplete = !!best && (best.missing > 0 || currentTotal.missing > 0);
  const gain = best ? Math.max(0, best.points - currentTotal.points) : 0;
  const totalLabel = (players: (LeaguePlayer | undefined)[]) => {
    const total = projectedTotal(players);
    return fmt(total.points) + (total.missing ? " (partial)" : "");
  };
  const flags = roster.filter((p) => p.status !== "ACTIVE" || p.bye),
    alerts = data?.alerts ?? [],
    unread = alerts.filter((a) => !prefs?.reviewed.includes(a.id));
  const matchup = snapshot?.matchups.find(
    (m) =>
      (m.homeId === snapshot.teamId || m.awayId === snapshot.teamId) &&
      m.week <= snapshot.week &&
      m.endWeek >= snapshot.week,
  );
  const opponentId = matchup
    ? matchup.homeId === snapshot?.teamId
      ? matchup.awayId
      : matchup.homeId
    : null;
  const opponent = snapshot?.teams.find((t) => t.id === opponentId);
  const opponentEstimate = opponent ? projectedTotal(starters(snapshot!, opponent.id)) : null;
  const strategy =
    !opponentEstimate || currentTotal.missing || opponentEstimate.missing
      ? "Balanced"
      : currentTotal.points - opponentEstimate.points >= 8
        ? "Play safe"
        : opponentEstimate.points - currentTotal.points >= 8
          ? "Chase upside"
          : "Balanced";
  const day = new Date().getDay();
  const briefing = day <= 2 ? "Waiver plan" : day <= 4 ? "Early game check" : "Final lineup check";
  const stale = !!data?.health.lastSuccess && Date.now() - data.health.lastSuccess > 30 * 60000;
  async function preference(change: Partial<Preferences>) {
    if (!prefs || busy) return;
    setBusy("save");
    try {
      const result = await api({ action: "preferences", ...change, updatedAt: prefs.updatedAt });
      setData((d) => (d ? { ...d, preferences: result.preferences } : d));
      if (change.notes !== undefined) {
        dirtyRef.current = false;
        setDirty(false);
        setNotice("Notes saved across your devices.");
      }
    } catch (error) {
      failure(error);
      void refresh();
    } finally {
      setBusy("");
    }
  }
  function go(next: Tab) {
    setTab(next);
    history.replaceState(null, "", "?tab=" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const watch = (id: string) =>
    void preference({
      watched: prefs!.watched.includes(id)
        ? prefs!.watched.filter((x) => x !== id)
        : [...prefs!.watched, id].slice(-100),
    });
  const choose = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : v.length < 2 ? [...v, id] : [v[1], id],
    );
  const close = () => {
    setPlayer(null);
    setPanel(null);
  };
  async function notifications(action: "enable" | "disable" | "test") {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setNotice("Notifications require a supported browser. Use Chrome on your Pixel.");
      return;
    }
    setBusy("push");
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error("Notification setup did not finish. Reload the app and try again.")),
            10000,
          ),
        ),
      ]);
      let subscription = await reg.pushManager.getSubscription();
      if (action === "disable") {
        if (subscription) {
          await api({ action: "push_unsubscribe", endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setPush(false);
        setNotice("Notifications disabled on this device.");
        return;
      }
      if (action === "enable") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setNotice(
            "Notification permission was not granted. You can change it in Chrome site settings.",
          );
          return;
        }
        const { publicKey } = await api({ action: "push_config" });
        if (!subscription)
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: Uint8Array.from(
              atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")),
              (c) => c.charCodeAt(0),
            ),
          });
        await api({ action: "push_subscribe", subscription: subscription.toJSON() });
        setPush(true);
        setNotice("Notifications enabled on this device. Use Send test to verify delivery.");
      } else if (subscription) {
        await api({ action: "push_test", endpoint: subscription.endpoint });
        setNotice("Test accepted by the push service. Check this device for the notification.");
      }
    } catch (error) {
      failure(error);
    } finally {
      setBusy("");
    }
  }
  async function logout() {
    epoch.current++;
    setBusy("logout");
    try {
      const r = await fetch("/api/gridiron/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error("Could not sign out. Try again.");
      setData(null);
      setDraft("");
      setPlayer(null);
      setPanel(null);
      setPhase("locked");
    } catch (error) {
      failure(error);
    } finally {
      setBusy("");
    }
  }
  function exportReview() {
    if (!snapshot || !prefs) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              snapshot,
              notes: prefs.notes,
              watched: prefs.watched,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridiron-private-review.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Private review exported. Store the file privately; it contains league data and notes.",
    );
  }
  function row(p: LeaguePlayer, slot?: string) {
    const estimate = forecast(p);
    return (
      <div className="ge-player" key={p.id}>
        <span className={"ge-position pos-" + p.position}>{slot ?? p.position}</span>
        <button className="ge-player-name" onClick={() => setPlayer(p)}>
          <PlayerPhoto player={p} />
          <span className="gi-player-copy">
            <strong>{p.name}</strong>
            <UsageBadge player={p} season={snapshot?.season ?? 2026} compact />
            <small>
              {p.proTeam} · {p.position} · {p.bye ? "BYE" : p.status}
              {p.locked ? " · Changes held" : ""}
            </small>
          </span>
        </button>
        <span className="ge-points">
          {fmt(estimate.points)}
          <small>expected pts</small>
        </span>
        <button
          className="ge-icon"
          disabled={!!busy}
          aria-label={(prefs?.watched.includes(p.id) ? "Unwatch " : "Watch ") + p.name}
          aria-pressed={prefs?.watched.includes(p.id)}
          onClick={() => watch(p.id)}
        >
          <Star size={20} weight={prefs?.watched.includes(p.id) ? "fill" : "regular"} />
        </button>
      </div>
    );
  }
  const teamLink = snapshot
    ? "https://fantasy.espn.com/football/team?leagueId=" +
      snapshot.leagueId +
      "&teamId=" +
      snapshot.teamId +
      "&seasonId=" +
      snapshot.season
    : "https://fantasy.espn.com/football/team?leagueId=10309566&teamId=25&seasonId=2026";
  const filtered =
    snapshot?.players
      .filter(
        (p) =>
          (p.name + " " + p.proTeam).toLowerCase().includes(search.toLowerCase()) &&
          (position === "ALL" || p.position === position) &&
          (!watchOnly || prefs?.watched.includes(p.id)),
      )
      .sort((a, b) => (forecast(b).points ?? -Infinity) - (forecast(a).points ?? -Infinity)) ?? [];
  return (
    <div className="ge-app ge-live">
      <link rel="stylesheet" href={liveCss} />
      <a className="ge-skip" href="#main">
        Skip to workspace
      </a>
      {phase !== "ready" ? (
        <main id="main" className="gl-gate">
          <span className="ge-logo">GE↗</span>
          <span className="ge-eyebrow">YOUR PRIVATE DECISION DESK</span>
          <h1>
            {phase === "loading"
              ? "Opening your workspace…"
              : phase === "locked"
                ? "Your league. Your eyes only."
                : "Let’s get you back in."}
          </h1>
          <p>
            {phase === "loading"
              ? "Checking your owner session."
              : phase === "locked"
                ? "Unlock with your owner key to view your connected ESPN league."
                : "The workspace could not load. Your saved connection is unchanged."}
          </p>
          {notice && <p role="alert">{notice}</p>}
          {phase === "locked" ? (
            <a className="ge-button" href="/connections">
              <ShieldCheck size={20} />
              Unlock workspace
            </a>
          ) : phase === "error" ? (
            <button
              className="ge-button"
              onClick={() => {
                setPhase("loading");
                void refresh();
              }}
            >
              Retry
            </button>
          ) : (
            <span className="gl-loader" aria-label="Loading" />
          )}
        </main>
      ) : (
        <>
          <aside className="ge-sidebar">
            <a href="/app" className="ge-brand">
              <span className="ge-logo">GE↗</span>
              <span>
                GRIDIRON
                <br />
                <b>EDGE</b>
              </span>
            </a>
            <div className="ge-league">
              <small>YOUR WORKSPACE</small>
              <strong>{snapshot?.leagueName ?? "Your ESPN league"}</strong>
              <span>{snapshot?.scoring ?? "Private owner access"}</span>
            </div>
            <nav aria-label="Main navigation">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={sectionFor(tab) === n.id ? "active" : ""}
                  onClick={() => go(n.id)}
                  aria-current={sectionFor(tab) === n.id ? "page" : undefined}
                >
                  <n.icon size={21} />
                  {n.title}
                  {n.id === "team" && unread.length > 0 && (
                    <span className="ge-count">{unread.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="ge-sidebar-note">
              <ShieldCheck size={26} />
              <strong>Your league. Your call.</strong>
              <p>
                Read-only insights.
                <br />
                Make your moves in ESPN.
              </p>
            </div>
          </aside>
          <div className="ge-body">
            <header className="ge-topbar">
              <a href="/app" className="ge-mobile-logo">
                GE↗
              </a>
              <span className="ge-breadcrumb">
                Workspace <span>/</span> {nav.find((n) => n.id === sectionFor(tab))?.title}
              </span>
              <div className="ge-top-actions">
                <span className={"ge-mode " + (stale ? "gl-stale" : "")}>
                  <i />
                  {prefs?.paused
                    ? "Sync paused"
                    : stale
                      ? "Data needs refresh"
                      : snapshot
                        ? "ESPN connected"
                        : "Awaiting first sync"}
                </span>
                <button
                  className="ge-icon"
                  disabled={!!busy || !data?.connected || prefs?.paused}
                  aria-label="Refresh league"
                  onClick={() => void sync()}
                >
                  <ArrowClockwise size={21} className={busy === "sync" ? "gl-spin" : ""} />
                </button>
                <button className="ge-icon" aria-label="Open updates" onClick={() => go("reports")}>
                  <Bell size={22} />
                </button>
              </div>
            </header>
            <main id="main" className="ge-main">
              <div className="gl-freshness">
                <span>
                  <Clock size={15} />
                  {data?.health.lastSuccess
                    ? "Updated " + ago(data.health.lastSuccess)
                    : "No league snapshot yet"}
                  {busy === "sync" ? " · Syncing…" : ""}
                </span>
                <a href={teamLink} target="_blank" rel="noreferrer">
                  Open ESPN <ArrowUpRight size={15} />
                </a>
              </div>
              {notice && (
                <div role="status" className="ge-notice">
                  {notice}
                  <button
                    className="ge-icon"
                    aria-label="Dismiss notification"
                    onClick={() => setNotice("")}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {data?.health.error && (
                <div className="gl-warning" role="alert">
                  <strong>Sync needs attention</strong>
                  <p>{data.health.error}</p>
                  <span>Next automatic attempt: {date(data.health.nextAttempt)}.</span>{" "}
                  <a href="/connections">Review connection</a>
                </div>
              )}
              {stale && (
                <div className="gl-warning">
                  <strong>These numbers are more than 30 minutes old.</strong>
                  <p>Verify availability and lineup locks in ESPN before acting.</p>
                </div>
              )}
              <div className="ge-heading">
                <div>
                  <span className="ge-eyebrow">
                    {snapshot
                      ? snapshot.season + " SEASON / WEEK " + snapshot.week
                      : "GRIDIRON EDGE"}
                  </span>
                  <h1>
                    {tab === "today"
                      ? "What should you do today?"
                      : tab === "team"
                        ? "Your starting point."
                        : tab === "players"
                          ? "Find your next edge."
                          : tab === "waivers"
                            ? "Work the waiver wire."
                            : tab === "reports"
                              ? "Know what changed."
                              : tab === "opponents"
                                ? "Know who you’re up against."
                                : tab === "league"
                                  ? "The bigger picture."
                                  : tab === "settings"
                                    ? "Settings"
                                    : "Your playbook."}
                  </h1>
                  <p>{snapshot?.teamName ?? "Your private ESPN football workspace."}</p>
                </div>
                {tab === "today" && snapshot && (
                  <button className="ge-button secondary" onClick={() => go("team")}>
                    <UsersThree size={18} />
                    Review my team
                  </button>
                )}
              </div>
              {snapshot && sectionFor(tab) === "team" && (
                <nav className="gi-section-tabs" aria-label="My team sections">
                  {[
                    { id: "team", label: "Roster" },
                    { id: "opponents", label: "Opponents" },
                    {
                      id: "reports",
                      label: `Updates${unread.length ? ` (${unread.length})` : ""}`,
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      className={tab === item.id ? "active" : ""}
                      onClick={() => go(item.id as Tab)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              )}
              {snapshot && sectionFor(tab) === "players" && (
                <nav className="gi-section-tabs" aria-label="Player sections">
                  <button
                    className={tab === "players" ? "active" : ""}
                    onClick={() => go("players")}
                  >
                    All players
                  </button>
                  <button
                    className={tab === "waivers" ? "active" : ""}
                    onClick={() => go("waivers")}
                  >
                    Waivers
                  </button>
                </nav>
              )}
              {sectionFor(tab) === "league" && (
                <nav className="gi-section-tabs" aria-label="League sections">
                  <button className={tab === "league" ? "active" : ""} onClick={() => go("league")}>
                    Standings
                  </button>
                  <button
                    className={tab === "settings" || tab === "more" ? "active" : ""}
                    onClick={() => go("settings")}
                  >
                    Settings
                  </button>
                </nav>
              )}
              {!snapshot && tab !== "settings" && tab !== "more" ? (
                <section className="ge-card gl-empty">
                  <ShieldCheck size={36} />
                  <h2>
                    {data?.connected
                      ? "Bring your league into focus."
                      : "Connect your ESPN league."}
                  </h2>
                  <p>
                    {data?.connected
                      ? busy === "sync"
                        ? "Importing rosters, scoring rules, matchups and player history. The first sync can take a minute."
                        : prefs?.paused
                          ? "Monitoring is paused. Resume in Settings to import your league."
                          : "Your credentials are saved. Start the first league sync."
                      : "Your private workspace needs an ESPN connection before it can show league data."}
                  </p>
                  {data?.connected ? (
                    <button
                      className="ge-button"
                      disabled={
                        !!busy ||
                        prefs?.paused ||
                        data.health.running ||
                        (data.health.nextAttempt ?? 0) > Date.now()
                      }
                      onClick={() => void sync()}
                    >
                      {busy === "sync" ? "Importing league…" : "Sync my league"}
                    </button>
                  ) : (
                    <a className="ge-button" href="/connections">
                      Connect ESPN
                    </a>
                  )}
                </section>
              ) : null}
              {snapshot && tab === "today" && (
                <>
                  <section className="gi-briefing-bar" aria-label="Current briefing">
                    <span>{briefing}</span>
                    <strong>{strategy}</strong>
                    <small>
                      {flags.length
                        ? `${flags.length} player${flags.length === 1 ? "" : "s"} need attention`
                        : "No roster problems found"}
                    </small>
                  </section>
                  <DecisionQueue
                    players={snapshot.players}
                    onPlayer={setPlayer}
                    advisor={advisor}
                    onSettings={() => go("settings")}
                  />
                  <section className="gi-today-glance" aria-label="This week at a glance">
                    <button className="ge-card" onClick={() => setPanel("lineup")}>
                      <span>Lineup</span>
                      <strong>{totalLabel(current)} predicted</strong>
                      <small>
                        {gain > 0.1
                          ? `About ${fmt(gain)} more points available`
                          : "Best lineup is already set"}
                      </small>
                    </button>
                    <button className="ge-card" onClick={() => go("opponents")}>
                      <span>Matchup strategy</span>
                      <strong>{strategy}</strong>
                      <small>
                        {opponent
                          ? `vs ${opponent.name} · ${managerLabel(opponent)}`
                          : "No opponent assigned"}
                      </small>
                    </button>
                    <button
                      className="ge-card"
                      onClick={() => go(flags.length ? "reports" : "waivers")}
                    >
                      <span>{flags.length ? "Needs attention" : "Waiver watch"}</span>
                      <strong>
                        {flags.length
                          ? `${flags.length} roster flag${flags.length === 1 ? "" : "s"}`
                          : `${wire.filter((w) => (w.gain ?? 0) > 0.1).length} possible upgrades`}
                      </strong>
                      <small>
                        {flags.length ? "Review injuries and byes" : "Review available players"}
                      </small>
                    </button>
                  </section>
                </>
              )}
              {snapshot && tab === "opponents" && (
                <OpponentDesk
                  snapshot={snapshot}
                  onPlayer={setPlayer}
                  onLineup={() => setPanel("lineup")}
                />
              )}
              {snapshot && tab === "team" && (
                <>
                  <div className="ge-toolbar">
                    <Explain topic="scoring">{snapshot.scoring}</Explain>
                    <span>{roster.length} rostered</span>
                    <button className="ge-button" onClick={() => setPanel("lineup")}>
                      <Lightning size={18} />
                      Review best lineup
                    </button>
                  </div>
                  <section className="ge-card">
                    <div className="ge-card-head">
                      <h2>Starters</h2>
                      <strong>
                        {totalLabel(current)} <small>estimate</small>
                      </strong>
                    </div>
                    {current.map((p, i) =>
                      p ? (
                        row(p, snapshot.slots[i].label)
                      ) : (
                        <div className="ge-player" key={i}>
                          {snapshot.slots[i].label}: Empty slot
                        </div>
                      ),
                    )}
                  </section>
                  <section className="ge-card ge-spaced">
                    <div className="ge-card-head">
                      <h2>Bench & reserve</h2>
                    </div>
                    {roster
                      .filter((p) => !snapshot.slots.some((s) => s.id === p.slot))
                      .map((p) => row(p, p.slot === "IR" ? "IR" : "BE"))}
                  </section>
                  <Explain topic="held">Why are some player changes held?</Explain>
                </>
              )}
              {snapshot && tab === "players" && (
                <>
                  <div className="ge-search">
                    <MagnifyingGlass size={22} />
                    <input
                      aria-label="Search players"
                      placeholder="Search name or NFL team"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                      className={"ge-button secondary " + (watchOnly ? "selected" : "")}
                      aria-pressed={watchOnly}
                      onClick={() => setWatchOnly(!watchOnly)}
                    >
                      <Star size={18} />
                      Watched
                    </button>
                  </div>
                  <div className="ge-filters" aria-label="Position filters">
                    {["ALL", ...new Set(snapshot.players.map((p) => p.position))].map((p) => (
                      <button
                        key={p}
                        className={position === p ? "selected" : ""}
                        aria-pressed={position === p}
                        onClick={() => setPosition(p)}
                      >
                        {p === "ALL" ? "All players" : p}
                      </button>
                    ))}
                  </div>
                  <p className="ge-footnote">
                    {filtered.length} players. Search covers league rosters and the imported
                    free-agent pool, not every NFL player. Select two to compare.
                  </p>
                  <section className="ge-card">
                    {filtered.length ? (
                      filtered.map((p) => (
                        <div className="ge-select-row" key={p.id}>
                          {row(p)}
                          <button
                            className="ge-compare-toggle"
                            aria-label={"Select " + p.name + " for comparison"}
                            aria-pressed={selected.includes(p.id)}
                            onClick={() => choose(p.id)}
                          >
                            <ArrowsLeftRight size={18} />
                            <span>{selected.includes(p.id) ? "Selected" : "Compare"}</span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="gl-empty">
                        <h2>No players match</h2>
                        <p>Clear a filter or search another name.</p>
                        <button
                          className="ge-button secondary"
                          onClick={() => {
                            setSearch("");
                            setPosition("ALL");
                            setWatchOnly(false);
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </section>
                  {selected.length > 0 && (
                    <div className="ge-compare-tray">
                      <span>{selected.length} of 2 selected</span>
                      <button
                        className="ge-button"
                        disabled={selected.length !== 2}
                        onClick={() => setPanel("compare")}
                      >
                        Compare players
                        <ArrowsLeftRight size={18} />
                      </button>
                      <button
                        className="ge-icon"
                        aria-label="Clear comparison"
                        onClick={() => setSelected([])}
                      >
                        <X size={20} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {snapshot && tab === "waivers" && (
                <>
                  <p className="ge-notice">
                    These are available players who could help your team. If your roster is full, we
                    suggest someone to drop. Review your waiver budget, claim order and future depth
                    before deciding.
                  </p>
                  <section className="ge-card">
                    <div className="ge-card-head">
                      <h2>Potential lineup upgrades</h2>
                      <span>
                        {snapshot.faab !== null ? (
                          <Explain topic="faab">Waiver budget left: ${snapshot.faab}</Explain>
                        ) : (
                          <Explain topic="waiver">How pickups work</Explain>
                        )}
                      </span>
                    </div>
                    {wire.map((w, i) => (
                      <div className="ge-waiver" key={w.player.id}>
                        <span className="ge-rank">{String(i + 1).padStart(2, "0")}</span>
                        <button className="gi-waiver-player" onClick={() => setPlayer(w.player)}>
                          <PlayerPhoto player={w.player} />
                          <strong>{w.player.name}</strong>
                          <span>
                            {w.player.position} · {w.player.proTeam} ·{" "}
                            {w.player.availability === "WAIVERS" ? "On waivers" : "Free agent"}
                          </span>
                          <p>
                            {w.drop ? "Compare dropping " + w.drop.name : "No drop modeled"} ·{" "}
                            {forecast(w.player).evidence}
                          </p>
                        </button>
                        <div className="ge-waiver-gain">
                          <strong>
                            {(w.gain ?? 0) > 0 ? "+" : ""}
                            {fmt(w.gain)}
                          </strong>
                          <Explain topic="gain">extra points</Explain>
                          <button
                            className="ge-icon"
                            disabled={!!busy}
                            aria-label={"Watch " + w.player.name}
                            aria-pressed={prefs?.watched.includes(w.player.id)}
                            onClick={() => watch(w.player.id)}
                          >
                            <Star
                              size={22}
                              weight={prefs?.watched.includes(w.player.id) ? "fill" : "regular"}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                    {!wire.length && (
                      <div className="gl-empty">
                        <h3>No eligible candidates right now.</h3>
                        <p>
                          Players may be locked, unavailable or missing schedule data. Review the
                          sync warnings below.
                        </p>
                      </div>
                    )}
                  </section>
                  <a
                    className="ge-button secondary ge-spaced"
                    href={teamLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Review moves in ESPN
                    <ArrowUpRight size={18} />
                  </a>
                </>
              )}
              {snapshot && tab === "reports" && (
                <>
                  <section className="ge-card">
                    <div className="ge-card-head">
                      <h2>Current availability</h2>
                      <span className="ge-tag">AS OF {ago(data!.health.lastSuccess)}</span>
                    </div>
                    {flags.length ? (
                      flags.map((p) => (
                        <article className="ge-report" key={p.id}>
                          <div className="ge-report-top">
                            <span className={"ge-status " + (p.status === "OUT" ? "out" : "")}>
                              {p.bye ? "BYE" : p.status}
                            </span>
                            <span className="ge-footnote">{date(p.kickoff)}</span>
                          </div>
                          <h3>{p.name}</h3>
                          <p>
                            {p.bye
                              ? "No NFL game scheduled this week."
                              : "ESPN roster availability flag. Read the latest team report before making a decision."}
                          </p>
                          <button className="ge-link" onClick={() => setPlayer(p)}>
                            Review player
                            <ArrowUpRight size={17} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="gl-empty">
                        <h3>No current roster flags.</h3>
                        <p>Keep checking final availability before kickoff.</p>
                      </div>
                    )}
                  </section>
                  <section className="ge-card ge-spaced">
                    <div className="ge-card-head">
                      <h2>Change log</h2>
                    </div>
                    {alerts.length ? (
                      alerts.map((a) => (
                        <article className="gl-alert" key={a.id}>
                          <small>{date(a.createdAt)}</small>
                          <h3>{a.title}</h3>
                          <p>{a.detail}</p>
                          <div className="ge-actions">
                            {a.playerId && snapshot.players.some((p) => p.id === a.playerId) && (
                              <button
                                className="ge-link"
                                onClick={() =>
                                  setPlayer(snapshot.players.find((p) => p.id === a.playerId)!)
                                }
                              >
                                View player
                              </button>
                            )}
                            <button
                              className="ge-link"
                              disabled={!!busy}
                              onClick={() =>
                                void preference({
                                  reviewed: prefs!.reviewed.includes(a.id)
                                    ? prefs!.reviewed.filter((x) => x !== a.id)
                                    : [...prefs!.reviewed, a.id].slice(-100),
                                })
                              }
                            >
                              {prefs?.reviewed.includes(a.id) ? "✓ Reviewed" : "Mark reviewed"}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="gl-empty">
                        <p>No changes recorded yet. Monitoring compares each successful sync.</p>
                      </div>
                    )}
                  </section>
                </>
              )}
              {snapshot && tab === "league" && (
                <>
                  <section className="ge-card">
                    <div className="ge-card-head">
                      <h2>League standings</h2>
                      <span className="ge-tag">{snapshot.teams.length} TEAMS</span>
                    </div>
                    <div className="gl-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Team</th>
                            <th scope="col">
                              <Explain topic="record">Wins–losses–ties</Explain>
                            </th>
                            <th scope="col">
                              <Explain topic="pointsFor">Points scored</Explain>
                            </th>
                            <th scope="col">
                              <Explain topic="pointsAgainst">Scored against you</Explain>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...snapshot.teams]
                            .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
                            .map((t) => (
                              <tr key={t.id} className={t.id === snapshot.teamId ? "gl-mine" : ""}>
                                <th scope="row">
                                  {t.name}
                                  {t.id === snapshot.teamId ? " (you)" : ""}
                                  <small className="gi-manager">{managerLabel(t)}</small>
                                </th>
                                <td>
                                  {t.wins}–{t.losses}–{t.ties}
                                </td>
                                <td>{fmt(t.pointsFor)}</td>
                                <td>{fmt(t.pointsAgainst)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="ge-footnote gl-pad">
                      Ordered by wins, then points for. ESPN’s playoff tiebreakers may differ.
                    </p>
                  </section>
                  <section className="ge-card ge-spaced">
                    <div className="ge-card-head">
                      <h2>Your season schedule</h2>
                    </div>
                    {snapshot.matchups
                      .filter((m) => m.homeId === snapshot.teamId || m.awayId === snapshot.teamId)
                      .map((m, i) => (
                        <div className="gl-schedule" key={i}>
                          <span>
                            W{m.week}
                            {m.endWeek !== m.week ? "–" + m.endWeek : ""}
                          </span>
                          <strong>
                            {snapshot.teams.find(
                              (t) => t.id === (m.homeId === snapshot.teamId ? m.awayId : m.homeId),
                            )?.name ?? "Bye / unassigned"}
                            <small className="gi-manager">
                              {m.awayId !== null
                                ? managerLabel(
                                    snapshot.teams.find(
                                      (t) =>
                                        t.id ===
                                        (m.homeId === snapshot.teamId ? m.awayId : m.homeId),
                                    ),
                                  )
                                : ""}
                            </small>
                          </strong>
                          <span>
                            {m.week <= snapshot.week
                              ? fmt(m.homeId === snapshot.teamId ? m.homeScore : m.awayScore) +
                                " : " +
                                fmt(m.homeId === snapshot.teamId ? m.awayScore : m.homeScore)
                              : "Upcoming"}
                          </span>
                        </div>
                      ))}
                  </section>
                  <section className="ge-card ge-spaced gl-pad">
                    <h2>How close were past predictions?</h2>
                    <Explain topic="accuracy">What does “point miss” mean?</Explain>
                    <p className="ge-footnote">
                      We tested older games using only the results available before each game. This
                      checks our past-results average. It does not yet measure the full weekly
                      estimate that also uses ESPN’s prediction.
                    </p>
                    <div className="gl-metrics">
                      <div>
                        <strong>{validation.games}</strong>
                        <span>past games checked</span>
                      </div>
                      <div>
                        <strong>{fmt(validation.mae)}</strong>
                        <span>point miss, with newer games counting more</span>
                      </div>
                      <div>
                        <strong>{fmt(validation.meanMae)}</strong>
                        <span>point miss, with every game counting equally</span>
                      </div>
                    </div>
                    {validation.games < 30 && (
                      <p className="ge-footnote">
                        Too few observations for a strong performance claim. More history will
                        improve this audit.
                      </p>
                    )}
                  </section>
                </>
              )}
              {tab === "settings" && (
                <>
                  <div className="ge-settings">
                    <AdvisorSettings advisor={advisor} />
                    <section className="ge-card ge-settings-card">
                      <ShieldCheck size={28} />
                      <h2>Connection & monitoring</h2>
                      <p>
                        Your league refreshes every 15 minutes. Active pages check for new saved
                        data once a minute.
                      </p>
                      <dl className="ge-system">
                        <div>
                          <dt>ESPN connection</dt>
                          <dd>{data?.connected ? "Saved and encrypted" : "Not connected"}</dd>
                        </div>
                        <div>
                          <dt>Last successful sync</dt>
                          <dd>{date(data?.health.lastSuccess)}</dd>
                        </div>
                        <div>
                          <dt>Scheduler last ran</dt>
                          <dd>{date(data?.health.heartbeat)}</dd>
                        </div>
                        <div>
                          <dt>Automatic retry</dt>
                          <dd>{data?.health.error ? date(data.health.nextAttempt) : "Ready"}</dd>
                        </div>
                        <div>
                          <dt>AI review</dt>
                          <dd>
                            {advisor.data?.enabled
                              ? "Enabled with daily limits"
                              : "Optional; configure above"}
                          </dd>
                        </div>
                      </dl>
                      {data?.health.heartbeat &&
                        Date.now() - data.health.heartbeat > 45 * 60000 && (
                          <p className="gl-warning">
                            The scheduler has not checked in recently. Refresh manually and review
                            deployment health.
                          </p>
                        )}
                      <button
                        className="ge-button secondary ge-full"
                        disabled={!!busy || !data?.connected}
                        onClick={() => void preference({ paused: !prefs?.paused })}
                      >
                        {prefs?.paused ? "Resume monitoring" : "Pause monitoring"}
                      </button>
                      <a className="ge-button ge-full" href="/connections">
                        Manage secure connection
                        <ArrowUpRight size={18} />
                      </a>
                      <button className="ge-link" disabled={!!busy} onClick={() => void logout()}>
                        <SignOut size={18} />
                        Sign out of this device
                      </button>
                    </section>
                    <div>
                      <section className="ge-card ge-settings-card">
                        <Bell size={28} />
                        <h2>Alerts on this device</h2>
                        <p>
                          Get a notification when tracked availability changes or a flagged starter
                          approaches kickoff. Notification text keeps league details off your lock
                          screen.
                        </p>
                        <button
                          className="ge-button ge-full"
                          disabled={!!busy}
                          onClick={() => void notifications(push ? "disable" : "enable")}
                        >
                          {push ? "Disable notifications" : "Enable notifications"}
                        </button>
                        {push && (
                          <button
                            className="ge-button secondary ge-full"
                            disabled={!!busy}
                            onClick={() => void notifications("test")}
                          >
                            Send test notification
                          </button>
                        )}
                        <p className="ge-footnote">
                          Closed-app delivery depends on browser permission and Android battery
                          settings. Test it once on your Pixel.
                        </p>
                      </section>
                      <section className="ge-card ge-settings-card ge-spaced">
                        <DownloadSimple size={28} />
                        <h2>Install on your Pixel</h2>
                        <p>
                          In Chrome, open the menu and choose Add to home screen or Install app.
                          This uses the same private workspace as your computer.
                        </p>
                        {install && (
                          <button
                            className="ge-button"
                            onClick={async () => {
                              await install.prompt();
                              await install.userChoice;
                              setInstall(null);
                            }}
                          >
                            Install Gridiron Edge
                          </button>
                        )}
                        <p className="ge-footnote">
                          Private league pages are not cached for offline viewing. Without internet,
                          the app shows an offline screen.
                        </p>
                      </section>
                    </div>
                  </div>
                  <section className="ge-card ge-settings-card ge-spaced">
                    <h2>Your weekly game plan</h2>
                    <label htmlFor="league-notes">Private notes, synced across your devices</label>
                    <textarea
                      id="league-notes"
                      maxLength={4000}
                      rows={5}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        dirtyRef.current = true;
                        setDirty(true);
                      }}
                      placeholder="Waiver priorities, matchup thoughts, and decisions to revisit…"
                    />
                    <div className="ge-actions">
                      <button
                        className="ge-button"
                        disabled={!dirty || !!busy || !data?.connected}
                        onClick={() => void preference({ notes: draft })}
                      >
                        {busy === "save" ? "Saving…" : "Save notes"}
                      </button>
                      <button
                        className="ge-button secondary"
                        disabled={!snapshot}
                        onClick={exportReview}
                      >
                        <DownloadSimple size={18} />
                        Export private review
                      </button>
                      <span className="ge-footnote">
                        {draft.length}/4,000{dirty ? " · Unsaved changes" : ""}
                      </span>
                    </div>
                  </section>
                </>
              )}
              {snapshot?.warnings.length ? (
                <aside className="gl-warning ge-spaced">
                  <h2>Data checks</h2>
                  <ul>
                    {snapshot.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </aside>
              ) : null}
              <footer className="ge-footer">
                <span>
                  GRIDIRON EDGE <span>/</span> A clearer game plan.
                </span>
                <span>
                  {snapshot
                    ? "ESPN data · " + date(snapshot.acquiredAt)
                    : "Private owner workspace"}
                </span>
              </footer>
            </main>
          </div>
          <nav className="ge-bottom-nav" aria-label="Mobile navigation">
            {nav.map((n) => (
              <button
                key={n.id}
                className={sectionFor(tab) === n.id ? "active" : ""}
                onClick={() => go(n.id as Tab)}
                aria-current={sectionFor(tab) === n.id ? "page" : undefined}
              >
                <n.icon size={24} />
                <span>{n.title}</span>
              </button>
            ))}
          </nav>
          <dialog
            ref={dialog}
            className="ge-dialog"
            aria-label={
              player?.name ?? (panel === "compare" ? "Player comparison" : "Lineup review")
            }
            onCancel={close}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="ge-dialog-inner">
              <button className="ge-dialog-close ge-icon" onClick={close} aria-label="Close detail">
                <X size={24} />
              </button>
              {player && (
                <>
                  <div className="gi-player-head">
                    <PlayerPhoto key={player.id} player={player} large />
                    <div>
                      <span className="ge-eyebrow">
                        {player.position} · {player.proTeam}
                      </span>
                      <h2>{player.name}</h2>
                      <span className="ge-status">{player.bye ? "BYE" : player.status}</span>
                    </div>
                  </div>
                  <nav className="gi-player-tabs" aria-label="Player details">
                    {(
                      [
                        ["overview", "Overview"],
                        ["why", "Why"],
                        ["news", "News"],
                        ["history", "History"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className={playerView === id ? "active" : ""}
                        onClick={() => setPlayerView(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {playerView === "overview" && (
                    <>
                      <div className="ge-detail-stats">
                        <div>
                          <strong>{fmt(forecast(player).points)}</strong>
                          <span>Predicted points</span>
                        </div>
                        <div>
                          <strong>
                            {fmt(forecast(player).low)}–{fmt(forecast(player).high)}
                          </strong>
                          <span>Recent range</span>
                        </div>
                      </div>
                      <dl className="ge-system">
                        <div>
                          <dt>Kickoff</dt>
                          <dd>{date(player.kickoff)}</dd>
                        </div>
                        <div>
                          <dt>Opponent</dt>
                          <dd>{player.opponent ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt>ESPN leagues with him</dt>
                          <dd>{ownershipText(player.owned)}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                  {playerView === "why" && (
                    <>
                      <p className="gi-callout">
                        <strong>
                          {forecast(player).points === null
                            ? "Wait"
                            : player.status !== "ACTIVE" || player.bye
                              ? "Needs attention"
                              : "Available"}
                        </strong>
                        {forecast(player).evidence}
                      </p>
                      <PlayerUsage player={player} season={snapshot?.season ?? 2026} />
                      <details className="gi-history">
                        <summary>Recent fantasy scores</summary>
                        {player.history.length ? (
                          <div className="gl-game-log">
                            {player.history.slice(-8).map((g) => (
                              <div key={g.season + ":" + g.week}>
                                <strong>{fmt(g.points)}</strong>
                                <span>W{g.week}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>No completed games available.</p>
                        )}
                      </details>
                    </>
                  )}
                  {playerView === "news" && snapshot && (
                    <PlayerMatchup player={player} snapshot={snapshot} />
                  )}
                  {playerView === "history" && snapshot && (
                    <PlayerMemory
                      key={player.id}
                      playerId={player.id}
                      sourceAt={snapshot.acquiredAt + ":" + (snapshot.contextUpdatedAt ?? 0)}
                    />
                  )}
                  <div className="ge-actions">
                    <button
                      className="ge-button"
                      disabled={!!busy}
                      onClick={() => watch(player.id)}
                    >
                      <Star size={18} />
                      {prefs?.watched.includes(player.id) ? "Watching" : "Watch player"}
                    </button>
                    <button
                      className="ge-button secondary"
                      onClick={() => {
                        choose(player.id);
                        close();
                        go("players");
                      }}
                    >
                      Compare player
                    </button>
                    <a
                      className="ge-link"
                      href={
                        player.position === "DST"
                          ? "https://www.espn.com/nfl/team/_/name/" + player.proTeam.toLowerCase()
                          : "https://www.espn.com/nfl/player/_/id/" + player.id
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      ESPN player news
                      <ArrowUpRight size={17} />
                    </a>
                  </div>
                </>
              )}
              {panel === "compare" && snapshot && (
                <>
                  <span className="ge-eyebrow">SIDE BY SIDE</span>
                  <h2>Make the clearer call.</h2>
                  <div className="ge-comparison">
                    {selected
                      .map((id) => snapshot.players.find((p) => p.id === id))
                      .filter((p): p is LeaguePlayer => !!p)
                      .map((p) => (
                        <article key={p.id}>
                          <PlayerPhoto player={p} large />
                          <span className="ge-position">{p.position}</span>
                          <h3>{p.name}</h3>
                          <span>{p.proTeam}</span>
                          <strong className="ge-compare-score">{fmt(forecast(p).points)}</strong>
                          <Explain topic="estimate">Expected points this week</Explain>
                          <dl>
                            <dt>
                              <Explain topic="projection">ESPN’s predicted points</Explain>
                            </dt>
                            <dd>{fmt(p.projected)}</dd>
                            <dt>
                              <Explain topic="range">Recent scoring range</Explain>
                            </dt>
                            <dd>
                              {fmt(forecast(p).low)}–{fmt(forecast(p).high)}
                            </dd>
                            <dt>Availability</dt>
                            <dd>{p.bye ? "BYE" : p.status}</dd>
                            <dt>History available</dt>
                            <dd>{p.history.length} games</dd>
                            <dt>Kickoff</dt>
                            <dd>{date(p.kickoff)}</dd>
                          </dl>
                          <p className="ge-footnote">{forecast(p).method}</p>
                          <button
                            className="ge-button secondary"
                            onClick={() => watch(p.id)}
                            disabled={!!busy}
                          >
                            {prefs?.watched.includes(p.id) ? "Watching" : "Watch player"}
                          </button>
                        </article>
                      ))}
                  </div>
                </>
              )}
              {panel === "lineup" && snapshot && best && (
                <>
                  <span className="ge-eyebrow">YOUR LINEUP REVIEW</span>
                  <h2>
                    {gain > 0.1 ? "Put your bench to work." : "Review your current starters."}
                  </h2>
                  <p>
                    Possible extra points this week:{" "}
                    <strong>
                      {incomplete
                        ? "Unavailable with incomplete estimates"
                        : "+" + fmt(gain) + " points"}
                    </strong>
                    .
                  </p>
                  <Explain topic="gain">How extra points are calculated</Explain>
                  <div className="ge-plan">
                    {best.picks.map((p, i) =>
                      p?.id !== current[i]?.id ? (
                        <div key={snapshot.slots[i].id}>
                          <span className="ge-position">{snapshot.slots[i].label}</span>
                          <span>
                            <small>{current[i]?.name ?? "Empty slot"} →</small>
                            <strong>{p?.name ?? "Empty slot"}</strong>
                          </span>
                          <span>{fmt(p ? forecast(p).points : null)}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                  {gain <= 0.1 && (
                    <p>
                      No material increase in the current estimate. Check empty slots, eligibility
                      and availability.
                    </p>
                  )}
                  {best.missing > 0 && (
                    <p className="gl-warning">
                      {best.missing} suggested slots lack an estimate or player. Treat this as an
                      incomplete plan.
                    </p>
                  )}
                  <p className="ge-footnote">
                    Preserves held starters, excludes out and bye players, and uses your league’s
                    eligible slots. No lineup changes are submitted by this app.
                  </p>
                  <a className="ge-button ge-full" href={teamLink} target="_blank" rel="noreferrer">
                    Make reviewed changes in ESPN
                    <ArrowUpRight size={18} />
                  </a>
                </>
              )}
            </div>
          </dialog>
        </>
      )}
    </div>
  );
}
