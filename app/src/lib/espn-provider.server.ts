import { boundedText, SafeError } from "./espn-security.server";
export type ESPNInput = { leagueId: number; teamId: number; season: number; swid: string; espnS2: string };
export type LeagueSummary = { leagueId: number; teamId: number; season: number; leagueName: string; teamName: string; verifiedAt: string; teamCount: number };
export function validateCredentials(body: Record<string, unknown>): ESPNInput {
  const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
  if (!integer(body.leagueId, 1, 999999999999) || !integer(body.teamId, 1, 10000) || !integer(body.season, 2018, new Date().getUTCFullYear() + 1)) {
    throw new SafeError(400, "invalid_league", "Check the numeric league ID, team ID and season.");
  }
  const swid = typeof body.swid === "string" ? body.swid.trim() : "";
  const espnS2 = typeof body.espnS2 === "string" ? body.espnS2.trim() : "";
  const uuid = "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
  if (!new RegExp("^(?:\\{" + uuid + "\\}|" + uuid + ")$").test(swid)) throw new SafeError(400, "invalid_swid", "SWID must be a complete UUID, with or without its surrounding braces.");
  if (espnS2.length < 10 || espnS2.length > 8192 || !/^[\x21-\x7e]+$/.test(espnS2) || /[;,"\\\\]/.test(espnS2)) throw new SafeError(400, "invalid_cookie", "Paste the complete espn_s2 value only, without a cookie name, spaces or line breaks.");
  return { leagueId: body.leagueId as number, teamId: body.teamId as number, season: body.season as number, swid: swid.startsWith("{") ? swid : "{" + swid + "}", espnS2 };
}
export async function verifyESPN(input: ESPNInput, transport: typeof fetch = fetch): Promise<LeagueSummary> {
  const url = new URL("https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/" + input.season + "/segments/0/leagues/" + input.leagueId);
  url.searchParams.append("view", "mSettings");
  url.searchParams.append("view", "mTeam");
  try {
    const response = await transport(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json", Cookie: "SWID=" + input.swid + "; espn_s2=" + input.espnS2 } });
    if (response.status === 401 || response.status === 403) throw new SafeError(422, "espn_auth", "ESPN did not accept these cookies. Sign in to ESPN again and copy fresh values.");
    if (response.status === 404) throw new SafeError(422, "espn_league", "ESPN could not find this league and season. Check the IDs and your ESPN access.");
    if (response.status === 429) throw new SafeError(503, "espn_busy", "ESPN is rate limiting requests. Try again later.");
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new SafeError(502, "espn_unavailable", "ESPN is unavailable or returned an unexpected response. Your saved connection has not changed.");
    const data = JSON.parse(await boundedText(response, 2 * 1024 * 1024));
    if (data.id !== input.leagueId || (data.seasonId !== undefined && data.seasonId !== input.season) || !Array.isArray(data.teams) || data.teams.length > 100) throw new SafeError(422, "espn_mismatch", "The ESPN response did not match this league and season.");
    const team = data.teams.find((item: { id?: number }) => item?.id === input.teamId);
    if (!team) throw new SafeError(422, "espn_team", "That team ID was not found in this league. Check your ESPN team link.");
    const cleanName = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;
    return { leagueId: input.leagueId, teamId: input.teamId, season: input.season, leagueName: cleanName(data.settings?.name, "Your ESPN league"), teamName: cleanName(team.name ?? [team.location, team.nickname].filter(Boolean).join(" "), "Team " + input.teamId), teamCount: data.teams.length, verifiedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError(502, "espn_unavailable", "Could not complete the read-only ESPN check. Try again later; saved credentials have not changed.");
  }
}
