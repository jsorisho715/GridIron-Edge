import { useEffect, useRef, useState } from "react";
import { X, Star, Check, ArrowUpRight, ShieldCheck, DownloadSimple } from "@phosphor-icons/react";
import { estimate, quantile, SLOTS, label, type Player } from "../../lib/gridiron";
const fmt = (n: number) => n.toFixed(1);
type Props = {
  player: Player | null;
  panel: "compare" | "lineup" | null;
  players: Player[];
  selected: string[];
  watched: string[];
  best: { score: number; picks: (Player | undefined)[] };
  starters: (Player | undefined)[];
  gain: number;
  close: () => void;
  watch: (id: string) => void;
  comparePlayer: (id: string) => void;
  apply: () => void;
};
export function Detail(p: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (p.player || p.panel) ref.current?.showModal();
    else ref.current?.close();
  }, [p.player, p.panel]);
  return (
    <dialog
      ref={ref}
      className="ge-dialog"
      aria-label={
        p.player?.name ?? (p.panel === "compare" ? "Player comparison" : "Sample lineup review")
      }
      onCancel={p.close}
      onClick={(e) => {
        if (e.target === e.currentTarget) p.close();
      }}
    >
      <div className="ge-dialog-inner">
        <button className="ge-dialog-close ge-icon" onClick={p.close} aria-label="Close detail">
          <X size={24} />
        </button>
        {p.player && (
          <>
            <span className="ge-eyebrow">
              {p.player.pos} · {p.player.team} · SAMPLE PLAYER
            </span>
            <h2>{p.player.name}</h2>
            <span className={"ge-status " + (p.player.status === "OUT" ? "out" : "")}>
              {p.player.status}
            </span>
            <div className="ge-detail-stats">
              <div>
                <strong>{fmt(estimate(p.player))}</strong>
                <span>estimated points</span>
              </div>
              <div>
                <strong>
                  {fmt(quantile(p.player.history, 0.25))}–{fmt(quantile(p.player.history, 0.75))}
                </strong>
                <span>historical middle 50%</span>
              </div>
            </div>
            <h3>Recent game log</h3>
            <div className="ge-history">
              {p.player.history.map((n, i) => (
                <div key={i}>
                  <strong>{fmt(n)}</strong>
                  <div style={{ height: Math.max(4, n * 4) + "px" }} />
                  <span>W{i + 1}</span>
                </div>
              ))}
            </div>
            <p>{p.player.note}</p>
            <p className="ge-footnote">
              All results are fictional. Past ranges are not guarantees or confidence intervals.
            </p>
            <div className="ge-actions">
              <button className="ge-button" onClick={() => p.watch(p.player!.id)}>
                <Star size={19} />
                {p.watched.includes(p.player.id) ? "Watching player" : "Watch player"}
              </button>
              <button className="ge-button secondary" onClick={() => p.comparePlayer(p.player!.id)}>
                Add to comparison
              </button>
            </div>
          </>
        )}
        {p.panel === "compare" && (
          <>
            <span className="ge-eyebrow">SIDE BY SIDE</span>
            <h2>Make the clearer call.</h2>
            <div className="ge-comparison">
              {p.players
                .filter((x) => p.selected.includes(x.id))
                .map((x) => (
                  <article key={x.id}>
                    <span className="ge-position">{x.pos}</span>
                    <h3>{x.name}</h3>
                    <span>{x.team}</span>
                    <strong className="ge-compare-score">{fmt(estimate(x))}</strong>
                    <span className="ge-footnote">estimated points</span>
                    <dl>
                      <dt>Historical middle 50%</dt>
                      <dd>
                        {fmt(quantile(x.history, 0.25))}–{fmt(quantile(x.history, 0.75))}
                      </dd>
                      <dt>Availability</dt>
                      <dd>{x.status}</dd>
                      <dt>Recent games</dt>
                      <dd>{x.history.length}</dd>
                    </dl>
                    <p>{x.note}</p>
                    <button className="ge-button secondary" onClick={() => p.watch(x.id)}>
                      {p.watched.includes(x.id) ? "Watching" : "Watch player"}
                    </button>
                  </article>
                ))}
            </div>
            <p className="ge-footnote">
              A higher average is not always safer. Consider the spread and availability. Sample
              data only.
            </p>
          </>
        )}
        {p.panel === "lineup" && (
          <>
            <span className="ge-eyebrow">LINEUP REVIEW · SAMPLE</span>
            <h2>{p.gain > 0.05 ? "Put your bench to work." : "Your best lineup is set."}</h2>
            <p>
              Potential gain: <strong>+{fmt(p.gain)} estimated points</strong>. This is a sample
              plan, not an ESPN transaction.
            </p>
            <div className="ge-plan">
              {p.best.picks.map((x, i) =>
                x?.id !== p.starters[i]?.id ? (
                  <div key={SLOTS[i]}>
                    <span className="ge-position">{label(SLOTS[i])}</span>
                    <span>
                      <small>{p.starters[i]?.name ?? "Empty slot"} →</small>
                      <strong>{x?.name ?? "Empty slot"}</strong>
                    </span>
                    <span>{x ? fmt(estimate(x)) : "—"}</span>
                  </div>
                ) : null,
              )}
            </div>
            {p.gain < 0.05 && <p>No eligible swap improves the current estimate.</p>}
            <p className="ge-footnote">
              Weights recent games more heavily. Excludes out and bye players and preserves locked
              slots. Always review availability.
            </p>
            <button className="ge-button ge-full" onClick={p.apply}>
              Apply sample lineup
              <Check size={20} />
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
export function Settings({
  notes,
  setNotes,
  notify,
  exportData,
}: {
  notes: string;
  setNotes: (v: string) => void;
  notify: (v: string) => void;
  exportData: () => void;
}) {
  const [status, setStatus] = useState("Checking…");
  useEffect(() => {
    void fetch("/api/gridiron/connection", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStatus(d.ready ? "Ready for owner access" : "Hosting keys needed"))
      .catch(() => setStatus("Status unavailable"));
  }, []);
  return (
    <>
      <div className="ge-settings">
        <section className="ge-card ge-settings-card">
          <ShieldCheck size={30} />
          <h2>Private ESPN connection</h2>
          <p>
            The secure connection screen is ready. Unlock it with your owner key,
            verify ESPN access and save encrypted cookies. The dashboard still
            uses fictional data.
          </p>
          <dl className="ge-system">
            <div>
              <dt>Workspace</dt>
              <dd>Sample mode</dd>
            </div>
            <div>
              <dt>Secure setup</dt>
              <dd>{status}</dd>
            </div>
            <div>
              <dt>Background monitoring</dt>
              <dd>Not activated</dd>
            </div>
            <div>
              <dt>LLM usage</dt>
              <dd>0 tokens per calculation</dd>
            </div>
          </dl>
          <a className="ge-button ge-full" href="/connections">
            <ShieldCheck size={20} />
            Open secure connections
          </a>
          <div className="ge-setup-help">
            <strong>When you’re ready to connect</strong>
            <p>
              Securely configure OWNER_ACCESS_KEY with at least 32 random characters and
              CREDENTIAL_ENCRYPTION_KEY with 64 hex characters in your website’s secret settings.
              Never paste keys or ESPN cookies into chat.
            </p>
            <p>
              League 10309566, team 25 and season 2026 are prefilled. Enter SWID
              and espn_s2 only on the owner-gated screen. Live dashboard sync
              is a separate, pending step.
            </p>
          </div>
          <a
            className="ge-link"
            href="https://fantasy.espn.com/football/"
            target="_blank"
            rel="noreferrer"
          >
            Open ESPN Fantasy
            <ArrowUpRight size={18} />
          </a>
        </section>
        <div>
          <section className="ge-card ge-settings-card">
            <DownloadSimple size={28} />
            <h2>On your Pixel. On your desk.</h2>
            <p>
              The same workspace adapts to both screens. On your Pixel, install it from Chrome for a
              home-screen icon and full-screen access.
            </p>
            <button
              className="ge-button"
              onClick={() =>
                notify(
                  "On your Pixel: open this page in Chrome → menu ⋮ → Add to Home screen → Install. On desktop, use Chrome’s install icon if shown.",
                )
              }
            >
              Installation instructions
              <ArrowUpRight size={18} />
            </button>
            <p className="ge-footnote">
              An internet connection is required to open the full workspace. The offline page
              contains no private data.
            </p>
          </section>
          <section className="ge-card ge-settings-card ge-spaced">
            <h2>Your decision notes</h2>
            <label htmlFor="notes">Remember for next review</label>
            <textarea
              id="notes"
              rows={4}
              maxLength={4000}
              value={notes}
              placeholder="What do you want to watch this week?"
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="ge-footnote">
              Notes, watched players and reviewed reports save automatically on this browser. They
              do not sync between your phone and computer yet.
            </p>
            <button className="ge-link" onClick={exportData}>
              <DownloadSimple size={18} />
              Export my review
            </button>
          </section>
        </div>
      </div>
      <details className="ge-method">
        <summary>How estimates work, and what is still pending</summary>
        <p>
          More recent games receive larger linear weights. The middle 50% is the historical
          25th–75th percentile, not a confidence interval. Matchup trials independently resample
          fictional histories, with a synthetic opponent at 94% of sampled production. They ignore
          teammate correlation and are not calibrated win probabilities.
        </p>
        <p>
          Pending live work: full league import and scheduled sync, real historical results, custom
          scoring validation, kickoff locks, verified injury sources, free-agent availability,
          background jobs, cross-device storage, push notifications and model backtesting. No live
          feature is implied by the sample screens.
        </p>
        <p>
          Design references:{" "}
          <a href="https://github.com/satnaing/shadcn-admin" target="_blank" rel="noreferrer">
            Shadcn Admin
          </a>{" "}
          and{" "}
          <a href="https://github.com/shadcn-ui/ui" target="_blank" rel="noreferrer">
            shadcn/ui
          </a>
          . Provider reference:{" "}
          <a href="https://github.com/cwendt94/espn-api" target="_blank" rel="noreferrer">
            espn-api
          </a>
          . Original interface and model code; no ESPN affiliation.
        </p>
      </details>
    </>
  );
}
