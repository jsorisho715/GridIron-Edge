import type { LeagueTeam } from './football';

export type RoastTone = 'sharp' | 'spicy';

// Local-only drafts: no model calls, fabricated results, injury jokes or auto-send.
export function trashTalk(team: Pick<LeagueTeam, 'id' | 'name'>, tone: RoastTone): string[] {
  const name = team.name.trim() || 'Your team';
  const lines = tone === 'spicy' ? [
    `${name}: all that roster management just to be a damn loading screen for someone else's championship.`,
    `${name}, your draft strategy has the confidence of someone clicking “accept all cookies.”`,
    `${name}, you don't need a trade partner. You need adult supervision on the waiver wire.`,
    `${name}, I've seen better roster construction in a gas station sandwich.`,
    `${name}, your championship speech is going to fit nicely in the drafts folder.`,
    `${name}, the only thing elite about this operation is the amount of shit you talk.`,
  ] : [
    `${name}, I respect the confidence. The roster is a separate conversation.`,
    `${name}, your team has “I'll fix it on waivers” energy.`,
    `${name}, keep refreshing those projections. Maybe they'll develop feelings for you.`,
    `${name}, your roster is a group project where everyone assumed someone else was doing the work.`,
    `${name}, save some excuses for the postgame interview.`,
    `${name}, that's a bold lineup. So is eating soup with a fork.`,
  ];
  const offset = Math.abs(Math.trunc(Number.isFinite(team.id) ? team.id : 0)) % lines.length;
  return [...lines.slice(offset), ...lines.slice(0, offset)];
}
