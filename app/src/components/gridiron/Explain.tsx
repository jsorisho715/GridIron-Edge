import type { ReactNode } from 'react';

const definitions = {
  ownership: 'How often this player is on a fantasy roster across ESPN leagues. 6% means about 6 out of every 100 leagues. It does not tell you their chance of playing, scoring well, or being available in your league.',
  estimate: 'Our best guess for fantasy points this week, using your league’s scoring rules. We combine ESPN’s prediction with recent game results when both are available. More points is better. The real score can be much higher or lower.',
  range: 'The middle half of this player’s last eight available game scores. If this says 8–16, about half those scores were in that range. Other games were lower or higher. It is not a guaranteed range for the next game.',
  baseline: 'An average of up to eight recent game scores, with newer games counting more. It describes past results, not a promised score this week.',
  projection: 'ESPN’s prediction of this player’s fantasy points for the current week, using your league’s scoring rules.',
  gain: 'How many more points the suggested lineup is expected to score than the lineup being compared. +3 means roughly 3 extra points, not a 3% better chance of winning.',
  faab: 'Your remaining fantasy waiver budget. You use it to bid on available players. This number comes from your league’s starting budget minus what ESPN says you spent. Check ESPN before placing a bid.',
  waiver: 'A free agent can usually be added right away. A player on waivers needs a claim. Your league’s claim order or bidding rules decide who gets them.',
  held: 'This app blocks suggestions that move a player after kickoff or when the kickoff time is unknown. Check ESPN for the final lock and eligibility rules.',
  record: 'Wins, losses, then ties. For example, 3–1–0 means three wins, one loss, and no ties.',
  pointsFor: 'All the fantasy points your team has scored this season. Higher is usually better. This is separate from your win and loss record.',
  pointsAgainst: 'All the fantasy points other teams scored while playing you this season. A high number means you faced high-scoring teams; it does not mean your NFL defense was bad.',
  accuracy: 'We replay older games using only the results available before each game. This number is the average size of the prediction miss in points. A miss of 4 means estimates were about 4 points away from the real score on average. Lower is better.',
  scoring: 'PPR means points per reception: a player earns points for catching a pass. Full PPR adds 1 point per catch; half PPR adds 0.5. Other scoring rules come from your ESPN league.',
  activity: 'Confirmed means ESPN reported a completed pickup, drop, or trade. Noticed means we saw different rosters between two refreshes. A player moving teams is only called a trade when ESPN confirms it. Private offers and pending waiver claims are not visible.',
  news: 'Player stories directly tag someone on this fantasy roster. NFL team context covers their real NFL team and may concern someone else. Headlines provide context; they do not change injury status or point estimates by themselves.',
} as const;
export function Explain({ topic, children }: { topic: keyof typeof definitions; children: ReactNode }) {
  return <details className="gi-help"><summary>{children}<span className="gi-help-icon" aria-hidden="true">?</span></summary><div>{definitions[topic]}</div></details>;
}
export function ownershipText(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return 'ESPN has not provided this number';
  return `${Number(value.toFixed(1))}% · about ${Number(value.toFixed(1))} out of 100 leagues`;
}
