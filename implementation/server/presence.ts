// Who is present, who has gone quiet, and whether the activity pauses or carries on. Pure functions
// over a plain state: the caller supplies the clock and keeps the state. Participants are the
// identities issued by the guest-identity component; "automatic" ones (computer players) are
// always present.
export type HostAbsentRule = "pause" | "continue";
export type PresenceSettings = { awayAfterSeconds: number; dropAfterSeconds: number; hostAbsentRule: HostAbsentRule };
export type PauseReason = "hostAbsent" | "allOffline" | "manual";
// Why a participant holds the activity's clock: looking at a result ("look") or reading a guide ("learn").
export type HoldKind = "look" | "learn";
export type Hold = { playerId: string; kind: HoldKind };
export type Participant = {
  id: string;
  automatic: boolean;
  // Takes part in the activity (not eliminated or sitting out of the count of who must be present).
  counts: boolean;
  connected: boolean;
  // A live connection is open: present without making requests.
  live: boolean;
  lastSeen: number;
  // Decisions taken for this participant while absent; cleared when they are seen again.
  misses: number;
  // Has chosen to skip turns, or has left a running activity. Cleared by `returned`.
  sittingOut: boolean;
};
export type PauseFlags = { hostAbsent: boolean; allOffline: boolean; manual: boolean };
// `holds` are participants whose hold stops the clock for everyone, in the order they were taken.
export type PresenceState = { participants: Participant[]; hostId: string | null; pause: PauseFlags; pausedSince: number | null; holds: Hold[] };

export const DEFAULT_SETTINGS: PresenceSettings = { awayAfterSeconds: 30, dropAfterSeconds: 30 * 60, hostAbsentRule: "pause" };

export function createPresence(hostId: string | null = null): PresenceState {
  return { participants: [], hostId, pause: { hostAbsent: false, allOffline: false, manual: false }, pausedSince: null, holds: [] };
}

export function find(state: PresenceState, id: string): Participant | undefined {
  return state.participants.find((p) => p.id === id);
}

export function addParticipant(state: PresenceState, who: { id: string; automatic?: boolean; counts?: boolean }, now: number): PresenceState {
  if (find(state, who.id)) return state;
  const p: Participant = { id: who.id, automatic: who.automatic ?? false, counts: who.counts ?? true, connected: true, live: false, lastSeen: now, misses: 0, sittingOut: false };
  return { ...state, participants: [...state.participants, p] };
}

export function removeParticipant(state: PresenceState, id: string): PresenceState {
  return { ...state, participants: state.participants.filter((p) => p.id !== id), hostId: state.hostId === id ? null : state.hostId, holds: state.holds.filter((h) => h.playerId !== id) };
}

export function setHost(state: PresenceState, hostId: string | null): PresenceState {
  return { ...state, hostId };
}

export function setCounts(state: PresenceState, id: string, counts: boolean): PresenceState {
  return update(state, id, (p) => (p.counts === counts ? p : { ...p, counts }));
}

// `now` is optional: without it `pausedSince` stays unset until the next `refresh` sets it.
export function setManualPause(state: PresenceState, on: boolean, now?: number): PresenceState {
  if (state.pause.manual === on) return state;
  const next = { ...state, pause: { ...state.pause, manual: on } };
  return { ...next, pausedSince: isPaused(next) ? (state.pausedSince ?? now ?? null) : null };
}

// A request from this participant arrived.
export function seen(state: PresenceState, id: string, now: number): PresenceState {
  const p = find(state, id);
  if (!p || (p.connected && p.lastSeen === now)) return state;
  return update(state, id, (q) => ({ ...q, lastSeen: now, connected: true, misses: q.connected ? q.misses : 0 }));
}

// A live connection opened (true) or the last one closed (false). While one is open the participant
// counts as present without making requests; once it closes, the silence rule runs from now.
export function setLive(state: PresenceState, id: string, live: boolean, now: number): PresenceState {
  const p = find(state, id);
  if (!p || p.automatic || p.live === live) return state;
  return update(state, id, (q) => ({ ...q, live, lastSeen: now, ...(live && !q.connected ? { connected: true, misses: 0 } : {}) }));
}

// The application went to the background or the participant left the screen.
export function away(state: PresenceState, id: string): PresenceState {
  const p = find(state, id);
  if (!p || !p.connected) return state;
  return dropHold(update(state, id, (q) => ({ ...q, connected: false })), id);
}

export function recordMiss(state: PresenceState, id: string): PresenceState {
  return update(state, id, (p) => ({ ...p, misses: p.misses + 1 }));
}

export function isPaused(state: PresenceState): boolean {
  return state.pause.hostAbsent || state.pause.allOffline || state.pause.manual;
}

export function pauseReasons(state: PresenceState): PauseReason[] {
  const reasons: PauseReason[] = [];
  if (state.pause.hostAbsent) reasons.push("hostAbsent");
  if (state.pause.allOffline) reasons.push("allOffline");
  if (state.pause.manual) reasons.push("manual");
  return reasons;
}

// Bring the state up to the clock: participants silent for longer than the away period (and with no
// live connection) become absent, then the pause flags follow the rule. While `active` is false
// (nothing is running) the pause flags are left alone.
export function refresh(state: PresenceState, now: number, settings: PresenceSettings = DEFAULT_SETTINGS, active = true): PresenceState {
  const awayMs = settings.awayAfterSeconds * 1000;
  const participants = state.participants.map((p) => (!p.automatic && p.connected && !p.live && now - p.lastSeen > awayMs ? { ...p, connected: false } : p));
  let next: PresenceState = participants.some((p, i) => p !== state.participants[i]) ? { ...state, participants } : state;
  if (!active) return next;
  const host = next.hostId ? find(next, next.hostId) : undefined;
  const humans = next.participants.filter((p) => p.counts && !p.automatic);
  const pause: PauseFlags = {
    hostAbsent: settings.hostAbsentRule === "pause" && !!host && !host.connected,
    allOffline: humans.length > 0 && !humans.some((p) => p.connected),
    manual: next.pause.manual,
  };
  next = { ...next, pause };
  return { ...next, pausedSince: isPaused(next) ? (state.pausedSince ?? now) : null };
}

// Everyone counted is gone and has been for the drop period: the caller ends or clears the activity.
export function abandoned(state: PresenceState, now: number, settings: PresenceSettings = DEFAULT_SETTINGS): boolean {
  return state.pause.allOffline && state.pausedSince !== null && now - state.pausedSince >= settings.dropAfterSeconds * 1000;
}

// The wall time of the next moment `refresh` or `abandoned` could change something, or null.
export function nextCheck(state: PresenceState, settings: PresenceSettings = DEFAULT_SETTINGS): number | null {
  const times: number[] = [];
  for (const p of state.participants) if (!p.automatic && p.connected && !p.live) times.push(p.lastSeen + settings.awayAfterSeconds * 1000 + 1);
  if (state.pause.allOffline && state.pausedSince !== null) times.push(state.pausedSince + settings.dropAfterSeconds * 1000);
  return times.length ? Math.min(...times) : null;
}

// Participants not heard from for longer than the given time and with no live connection, for a
// caller applying its own, shorter or longer rule (for example giving up a waiting-room seat).
export function silentIds(state: PresenceState, now: number, olderThanSeconds: number): string[] {
  return state.participants.filter((p) => !p.automatic && !p.live && now - p.lastSeen > olderThanSeconds * 1000).map((p) => p.id);
}

export function absentIds(state: PresenceState): string[] {
  return state.participants.filter((p) => !p.automatic && !p.connected).map((p) => p.id);
}

function update(state: PresenceState, id: string, change: (p: Participant) => Participant): PresenceState {
  const index = state.participants.findIndex((p) => p.id === id);
  if (index < 0) return state;
  const changed = change(state.participants[index]);
  if (changed === state.participants[index]) return state;
  const participants = state.participants.slice();
  participants[index] = changed;
  return { ...state, participants };
}

// ---- sitting out ----

// The participant skips their turns (the activity acts for them) until `returned`.
export function sitOut(state: PresenceState, id: string): PresenceState {
  return update(state, id, (p) => (p.sittingOut ? p : { ...p, sittingOut: true }));
}

// Back at the activity: no longer sitting out, no missed turns, present as of `now`.
export function returned(state: PresenceState, id: string, now: number): PresenceState {
  return update(state, id, (p) => (!p.sittingOut && p.misses === 0 && p.connected && p.lastSeen === now ? p : { ...p, sittingOut: false, misses: 0, connected: true, lastSeen: now }));
}

// The participant left a running activity: sitting out and gone. A hold goes with them.
export function leftGame(state: PresenceState, id: string): PresenceState {
  return dropHold(update(state, id, (p) => (p.sittingOut && !p.connected ? p : { ...p, sittingOut: true, connected: false })), id);
}

// ---- reading one participant (an unknown id is absent, not sitting out, with no misses and never seen) ----

export const isConnected = (state: PresenceState, id: string): boolean => find(state, id)?.connected ?? false;
export const isLive = (state: PresenceState, id: string): boolean => find(state, id)?.live ?? false;
export const isSittingOut = (state: PresenceState, id: string): boolean => find(state, id)?.sittingOut ?? false;
export const misses = (state: PresenceState, id: string): number => find(state, id)?.misses ?? 0;
export const lastSeen = (state: PresenceState, id: string): number => find(state, id)?.lastSeen ?? 0;
export const isManualPause = (state: PresenceState): boolean => state.pause.manual;
// Wall time the activity first paused, or null while it is not paused.
export const pausedSince = (state: PresenceState): number | null => state.pausedSince;

// ---- holds: the one place that records who is holding the clock ----

function dropHold(state: PresenceState, id: string): PresenceState {
  const holds = state.holds;
  return holds.some((h) => h.playerId === id) ? { ...state, holds: holds.filter((h) => h.playerId !== id) } : state;
}

// Take (kind "look" or "learn") or release (null) a hold. Only a person who is in the activity can hold, only while
// it runs, and a "look" only while a result is showing; anything else changes nothing. The same state comes back
// when nothing changes.
export function setHold(state: PresenceState, id: string, kind: HoldKind | null, context: { running: boolean; roundOver: boolean }): PresenceState {
  const p = find(state, id);
  const current = state.holds.find((h) => h.playerId === id)?.kind ?? null;
  if (kind !== null && (!p || p.automatic || !context.running)) return state;
  if (kind === "look" && !context.roundOver) return state;
  if (current === kind) return state;
  if (kind === null) return dropHold(state, id);
  const holds = state.holds;
  return { ...state, holds: current === null ? [...holds, { playerId: id, kind }] : holds.map((h) => (h.playerId === id ? { playerId: id, kind } : h)) };
}

export const isHeld = (state: PresenceState): boolean => state.holds.length > 0;

export function holds(state: PresenceState): Hold[] {
  return state.holds.map((h) => ({ ...h }));
}

// ---- running the activity from an engine ----

export type RefreshContext = { hostId: string | null; running: boolean; roundOver: boolean; activeIds: readonly string[] };

// `refresh` for an engine that owns the roster: the host and the people still in the activity come from the engine.
// The silence rule applies as in `refresh`. Holds end when the activity is not running, when their person is gone
// or away, and for a "look" once no result is showing. While `running` is false the pause flags are left alone;
// otherwise they follow the host and the people still in (`activeIds`).
export function refreshFor(state: PresenceState, now: number, settings: PresenceSettings, context: RefreshContext): PresenceState {
  const awayMs = settings.awayAfterSeconds * 1000;
  let participants = state.participants.map((p) => (!p.automatic && p.connected && !p.live && now - p.lastSeen > awayMs ? { ...p, connected: false } : p));
  const holds = state.holds.filter((h) => context.running && participants.find((p) => p.id === h.playerId)?.connected && (h.kind !== "look" || context.roundOver));
  let next: PresenceState = { ...state, participants, holds };
  if (!context.running) return changed(state, next) ? next : state;
  const active = new Set(context.activeIds);
  participants = participants.map((p) => (!p.automatic && p.counts !== active.has(p.id) ? { ...p, counts: active.has(p.id) } : p));
  const host = context.hostId ? participants.find((p) => p.id === context.hostId) : undefined;
  const humans = participants.filter((p) => p.counts && !p.automatic);
  const pause: PauseFlags = {
    hostAbsent: settings.hostAbsentRule === "pause" && !!host && !host.connected,
    allOffline: humans.length > 0 && !humans.some((p) => p.connected),
    manual: state.pause.manual,
  };
  next = { ...next, participants, hostId: context.hostId, pause };
  next = { ...next, pausedSince: isPaused(next) ? (state.pausedSince ?? now) : null };
  return changed(state, next) ? next : state;
}

function changed(before: PresenceState, after: PresenceState): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

// A new game or lobby: keep these participants, with sitting out and missed turns cleared, and no pauses or holds.
export function restart(state: PresenceState, keepIds: readonly string[]): PresenceState {
  const keep = new Set(keepIds);
  const participants = state.participants.filter((p) => keep.has(p.id)).map((p) => ({ ...p, sittingOut: false, misses: 0 }));
  return { participants, hostId: state.hostId !== null && keep.has(state.hostId) ? state.hostId : null, pause: { hostAbsent: false, allOffline: false, manual: false }, pausedSince: null, holds: [] };
}

// The wall time the silence rule next turns someone from present to absent, or null. (`nextCheck` also includes the
// drop period; an engine that applies its own stale-table rule wants only this.)
export function nextSilence(state: PresenceState, settings: PresenceSettings = DEFAULT_SETTINGS): number | null {
  const times = state.participants.filter((p) => !p.automatic && p.connected && !p.live).map((p) => p.lastSeen + settings.awayAfterSeconds * 1000 + 1);
  return times.length ? Math.min(...times) : null;
}

export function validateSettings(settings: Partial<PresenceSettings> = {}): PresenceSettings {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!Number.isSafeInteger(s.awayAfterSeconds) || s.awayAfterSeconds < 1) throw new RangeError("awayAfterSeconds must be a whole number of at least 1");
  if (!Number.isSafeInteger(s.dropAfterSeconds) || s.dropAfterSeconds < 1) throw new RangeError("dropAfterSeconds must be a whole number of at least 1");
  if (s.hostAbsentRule !== "pause" && s.hostAbsentRule !== "continue") throw new RangeError("hostAbsentRule must be pause or continue");
  return s;
}

// ---- the engine's view: one object with the settings bound ----

export type PresenceApi = {
  settings: PresenceSettings;
  create(): PresenceState;
  register(state: PresenceState, id: string, now: number, kind: "person" | "computer"): PresenceState;
  unregister(state: PresenceState, id: string): PresenceState;
  restart(state: PresenceState, keepIds: readonly string[]): PresenceState;
  seen(state: PresenceState, id: string, now: number): PresenceState;
  setLive(state: PresenceState, id: string, live: boolean, now: number): PresenceState;
  away(state: PresenceState, id: string): PresenceState;
  sitOut(state: PresenceState, id: string): PresenceState;
  returned(state: PresenceState, id: string, now: number): PresenceState;
  leftGame(state: PresenceState, id: string): PresenceState;
  recordMiss(state: PresenceState, id: string): PresenceState;
  isConnected(state: PresenceState, id: string): boolean;
  isLive(state: PresenceState, id: string): boolean;
  isSittingOut(state: PresenceState, id: string): boolean;
  misses(state: PresenceState, id: string): number;
  lastSeen(state: PresenceState, id: string): number;
  refresh(state: PresenceState, now: number, context: RefreshContext): PresenceState;
  setManualPause(state: PresenceState, on: boolean, now?: number): PresenceState;
  setHold(state: PresenceState, id: string, kind: HoldKind | null, context: { running: boolean; roundOver: boolean }): PresenceState;
  isPaused(state: PresenceState): boolean;
  pauseReasons(state: PresenceState): PauseReason[];
  isManualPause(state: PresenceState): boolean;
  pausedSince(state: PresenceState): number | null;
  isHeld(state: PresenceState): boolean;
  holds(state: PresenceState): Hold[];
  nextWake(state: PresenceState): number | null;
};

// What `ae/presence` consumers such as the turn engine call. State is the PresenceState above.
export function createPresenceApi(settings: Partial<PresenceSettings> = {}): PresenceApi {
  const bound = validateSettings(settings);
  return {
    settings: bound,
    create: () => createPresence(null),
    register: (state, id, now, kind) => addParticipant(state, { id, automatic: kind === "computer" }, now),
    unregister: removeParticipant,
    restart,
    seen,
    setLive,
    away,
    sitOut,
    returned,
    leftGame,
    recordMiss,
    isConnected,
    isLive,
    isSittingOut,
    misses,
    lastSeen,
    refresh: (state, now, context) => refreshFor(state, now, bound, context),
    setManualPause,
    setHold,
    isPaused,
    pauseReasons,
    isManualPause,
    pausedSince,
    isHeld,
    holds,
    nextWake: (state) => nextSilence(state, bound),
  };
}
