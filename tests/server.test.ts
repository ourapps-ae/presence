import assert from "node:assert/strict";
import test from "node:test";
import {
  abandoned, absentIds, addParticipant, away, createPresence, isPaused, nextCheck, pauseReasons, recordMiss, refresh, removeParticipant,
  seen, setCounts, setHost, setLive, setManualPause, silentIds, createPresenceApi, validateSettings, refreshFor, nextSilence, setHold, holds, isHeld, sitOut,
  returned, leftGame, restart, type PresenceApi, type PresenceSettings, type PresenceState,
} from "../implementation/server/presence.ts";
import { hostDropsAndReturns } from "../examples/consumer.ts";

const settings: PresenceSettings = { awayAfterSeconds: 30, dropAfterSeconds: 1800, hostAbsentRule: "pause" };
const room = (): PresenceState => {
  let s = createPresence("host");
  s = addParticipant(s, { id: "host" }, 0);
  s = addParticipant(s, { id: "ann" }, 0);
  s = addParticipant(s, { id: "bot", automatic: true }, 0);
  return s;
};

test("state functions do not change the state they are given", () => {
  const s = room();
  const frozen = structuredClone(s);
  away(s, "ann"); seen(s, "ann", 5); setLive(s, "ann", true, 5); refresh(s, 10 ** 6, settings); setManualPause(s, true, 1);
  assert.deepEqual(s, frozen);
});

test("silence beyond the away period makes a participant absent, exactly after it", () => {
  let s = room();
  s = refresh(s, 30_000, settings);
  assert.deepEqual(absentIds(s), []);
  s = refresh(s, 30_001, settings);
  assert.deepEqual(absentIds(s).sort(), ["ann", "host"]);
  assert.equal(s.participants.find((p) => p.id === "bot")!.connected, true, "automatic participants are never absent");
});

test("a live connection counts as present without requests, and its closing restarts the silence", () => {
  let s = room();
  s = setLive(s, "ann", true, 0);
  s = refresh(s, 10 ** 6, settings);
  assert.equal(s.participants.find((p) => p.id === "ann")!.connected, true);
  s = setLive(s, "ann", false, 100_000);
  s = refresh(s, 120_000, settings);
  assert.equal(s.participants.find((p) => p.id === "ann")!.connected, true);
  s = refresh(s, 130_001, settings);
  assert.equal(s.participants.find((p) => p.id === "ann")!.connected, false);
  assert.equal(setLive(s, "bot", true, 1), s, "automatic participants ignore connections");
});

test("seen brings an absent participant back and clears their missed decisions", () => {
  let s = room();
  s = away(s, "ann");
  s = recordMiss(recordMiss(s, "ann"), "ann");
  assert.equal(s.participants[1].misses, 2);
  s = seen(s, "ann", 500);
  assert.deepEqual([s.participants[1].connected, s.participants[1].misses, s.participants[1].lastSeen], [true, 0, 500]);
  assert.equal(seen(s, "ann", 500), s, "nothing changes when seen twice at the same time");
  assert.equal(seen(s, "nobody", 1), s);
  assert.equal(away(away(s, "ann"), "ann").participants[1].connected, false);
});

test("host absence pauses by rule, and continues when the rule says continue", () => {
  let s = refresh(away(room(), "host"), 1_000, settings);
  assert.deepEqual(pauseReasons(s), ["hostAbsent"]);
  assert.equal(s.pausedSince, 1_000);
  s = refresh(seen(s, "host", 2_000), 2_000, settings);
  assert.deepEqual(pauseReasons(s), []);
  assert.equal(s.pausedSince, null);
  const keep = refresh(away(room(), "host"), 1_000, { ...settings, hostAbsentRule: "continue" });
  assert.equal(isPaused(keep), false);
});

test("everyone counted absent pauses and, after the drop period, is abandoned", () => {
  let s = away(away(room(), "host"), "ann");
  s = refresh(s, 1_000, { ...settings, hostAbsentRule: "continue" });
  assert.deepEqual(pauseReasons(s), ["allOffline"]);
  assert.equal(nextCheck(s, settings), 1_000 + 1_800_000);
  assert.equal(abandoned(s, 1_000 + 1_800_000 - 1, settings), false);
  assert.equal(abandoned(s, 1_000 + 1_800_000, settings), true);
  s = refresh(seen(s, "ann", 2_000), 2_000, settings);
  assert.equal(abandoned(s, 10 ** 9, settings), false);
});

test("participants who do not count are ignored when deciding that everyone is gone", () => {
  let s = away(away(room(), "host"), "ann");
  s = setCounts(setCounts(s, "host", false), "ann", false);
  assert.equal(refresh(s, 1_000, { ...settings, hostAbsentRule: "continue" }).pause.allOffline, false);
  assert.equal(refresh(createPresence(), 1_000, settings).pause.allOffline, false, "an empty room is not paused");
});

test("manual pause stands until lifted and is reported with the others", () => {
  let s = setManualPause(room(), true, 7);
  s = refresh(away(s, "host"), 9, settings);
  assert.deepEqual(pauseReasons(s), ["hostAbsent", "manual"]);
  assert.equal(s.pausedSince, 7);
  s = refresh(seen(setManualPause(s, false, 20), "host", 20), 20, settings);
  assert.deepEqual(pauseReasons(s), []);
  assert.equal(s.pausedSince, null);
});

test("while inactive only absence is tracked, pause flags are left as they were", () => {
  const s = refresh(away(room(), "host"), 1_000, settings, false);
  assert.deepEqual(pauseReasons(s), []);
  assert.equal(s.participants[0].connected, false);
});

test("next check is the soonest silence deadline of a participant without a live connection", () => {
  let s = room();
  assert.equal(nextCheck(s, settings), 30_001);
  s = setLive(setLive(s, "host", true, 0), "ann", true, 0);
  assert.equal(nextCheck(s, settings), null);
  s = setLive(s, "ann", false, 5_000);
  assert.equal(nextCheck(s, settings), 35_001);
});

test("silent participants for a caller's own rule, host changes and removal", () => {
  let s = room();
  s = seen(s, "ann", 50_000);
  assert.deepEqual(silentIds(s, 70_000, 60), ["host"]);
  s = removeParticipant(s, "host");
  assert.equal(s.hostId, null);
  assert.equal(setHost(s, "ann").hostId, "ann");
  assert.equal(addParticipant(s, { id: "ann" }, 9), s, "adding twice changes nothing");
});

test("example: the host drops, the room pauses, the host returns and it carries on", () => {
  assert.deepEqual(hostDropsAndReturns(settings), { running: [], whileAway: ["hostAbsent"], wake: null, afterReturn: [], abandoned: false });
});

// ---- the engine's view (createPresenceApi) ----

const api: PresenceApi = createPresenceApi();
const table = (): PresenceState => {
  let s = api.create();
  s = api.register(s, "host", 0, "person");
  s = api.register(s, "ann", 0, "person");
  s = api.register(s, "bot", 0, "computer");
  return s;
};
const running = { running: true, roundOver: false, activeIds: ["host", "ann", "bot"] };

test("create and register: people and computers, registering twice changes nothing, unregistering also drops a hold", () => {
  const s = table();
  assert.deepEqual(s.participants.map((p) => [p.id, p.automatic, p.sittingOut]), [["host", false, false], ["ann", false, false], ["bot", true, false]]);
  assert.equal(api.register(s, "ann", 9, "person"), s);
  let held = api.setHold(s, "ann", "learn", { running: true, roundOver: false });
  assert.deepEqual(api.holds(held), [{ playerId: "ann", kind: "learn" }]);
  held = api.unregister(held, "ann");
  assert.equal(api.isHeld(held), false);
  assert.equal(held.participants.length, 2);
});

test("sitting out, returning and leaving: the flags, the misses and the connection", () => {
  let s = table();
  assert.equal(api.isSittingOut(s, "ann"), false);
  s = api.sitOut(s, "ann");
  assert.equal(api.isSittingOut(s, "ann"), true);
  assert.equal(api.sitOut(s, "ann"), s, "already sitting out: same object");
  assert.equal(api.sitOut(s, "nobody"), s);
  s = api.recordMiss(api.recordMiss(api.away(s, "ann"), "ann"), "ann");
  assert.deepEqual([api.isConnected(s, "ann"), api.misses(s, "ann")], [false, 2]);
  s = api.returned(s, "ann", 700);
  assert.deepEqual([api.isSittingOut(s, "ann"), api.isConnected(s, "ann"), api.misses(s, "ann"), api.lastSeen(s, "ann")], [false, true, 0, 700]);
  assert.equal(api.returned(s, "ann", 700), s, "nothing to change: same object");
  s = api.leftGame(s, "ann");
  assert.deepEqual([api.isSittingOut(s, "ann"), api.isConnected(s, "ann")], [true, false]);
  assert.equal(api.leftGame(s, "ann"), s);
  assert.equal(returned(sitOut(table(), "host"), "host", 5).participants[0].sittingOut, false, "module functions agree");
  assert.equal(leftGame(table(), "host").participants[0].connected, false);
});

test("accessors on one participant: unknown ids are absent, not sitting out, no misses, never seen", () => {
  const s = api.setLive(table(), "ann", true, 40);
  assert.deepEqual([api.isLive(s, "ann"), api.isLive(s, "host"), api.lastSeen(s, "ann"), api.lastSeen(s, "host")], [true, false, 40, 0]);
  assert.deepEqual([api.isConnected(s, "x"), api.isLive(s, "x"), api.isSittingOut(s, "x"), api.misses(s, "x"), api.lastSeen(s, "x")], [false, false, false, 0, 0]);
  assert.equal(api.seen(s, "ann", 40), s, "same object when nothing changes");
  assert.equal(api.setLive(s, "bot", true, 1), s);
});

test("holds: one owner of the clock hold; look only after a round, learn any time; people only; running only", () => {
  const s = table();
  const ctx = (roundOver: boolean, runningNow = true) => ({ running: runningNow, roundOver });
  assert.equal(api.setHold(s, "ann", "look", ctx(false)), s, "no result showing: no look");
  assert.equal(api.setHold(s, "ann", "learn", ctx(false, false)), s, "not running: no hold");
  assert.equal(api.setHold(s, "bot", "learn", ctx(false)), s, "a computer cannot hold");
  assert.equal(api.setHold(s, "nobody", "learn", ctx(false)), s);
  assert.equal(api.setHold(s, "ann", null, ctx(false)), s, "releasing nothing changes nothing");
  let h = api.setHold(s, "ann", "look", ctx(true));
  assert.equal(api.setHold(h, "ann", "look", ctx(true)), h, "same hold again: same object");
  h = api.setHold(h, "host", "learn", ctx(false));
  assert.deepEqual(api.holds(h), [{ playerId: "ann", kind: "look" }, { playerId: "host", kind: "learn" }]);
  h = api.setHold(h, "ann", "learn", ctx(false));
  assert.deepEqual(api.holds(h), [{ playerId: "ann", kind: "learn" }, { playerId: "host", kind: "learn" }], "changing kind keeps the place");
  assert.equal(api.isHeld(h), true);
  h = api.setHold(api.setHold(h, "ann", null, ctx(true)), "host", null, ctx(true));
  assert.deepEqual([api.isHeld(h), api.holds(h)], [false, []]);
  assert.equal(isHeld(s), false);
  assert.deepEqual(holds(setHold(s, "ann", "learn", ctx(false))), [{ playerId: "ann", kind: "learn" }]);
});

test("a hold goes with its person's connection: away, leaving, and silence end it", () => {
  const hold = (s: PresenceState, id: string) => api.setHold(s, id, "learn", { running: true, roundOver: false });
  assert.equal(api.isHeld(api.away(hold(table(), "ann"), "ann")), false);
  assert.equal(api.isHeld(api.leftGame(hold(table(), "ann"), "ann")), false);
  const quiet = api.refresh(hold(table(), "ann"), 100_000, running);
  assert.equal(api.isHeld(quiet), false, "silent past the away period: the hold ends with the connection");
  const live = api.refresh(hold(api.setLive(table(), "ann", true, 0), "ann"), 100_000, running);
  assert.equal(api.isHeld(live), true, "a live connection keeps it");
});

test("refresh: holds end when the activity stops or a look has nothing left to look at", () => {
  let s = api.setHold(table(), "ann", "look", { running: true, roundOver: true });
  s = api.setHold(s, "host", "learn", { running: true, roundOver: true });
  assert.equal(api.holds(api.refresh(s, 10, { ...running, roundOver: true })).length, 2);
  assert.deepEqual(api.holds(api.refresh(s, 10, { ...running, roundOver: false })), [{ playerId: "host", kind: "learn" }]);
  assert.deepEqual(api.holds(api.refresh(s, 10, { running: false, roundOver: true, activeIds: [] })), []);
});

test("refresh applies the silence rule, then pauses by the host and the people still in", () => {
  let s = table();
  s = api.refresh(s, 30_000, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.deepEqual(api.pauseReasons(s), []);
  s = api.refresh(s, 30_001, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.deepEqual(api.pauseReasons(s), ["hostAbsent", "allOffline"]);
  assert.equal(api.isPaused(s), true);
  assert.equal(api.pausedSince(s), 30_001);
  assert.equal(api.isConnected(s, "bot"), true, "computers never go quiet");
  s = api.refresh(api.seen(s, "host", 31_000), 31_000, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.deepEqual(api.pauseReasons(s), []);
  assert.equal(api.pausedSince(s), null);
});

test("refresh: people who are out of the game do not count towards everyone being gone", () => {
  let s = api.away(api.away(table(), "host"), "ann");
  s = api.refresh(s, 1_000, { hostId: null, running: true, roundOver: false, activeIds: ["ann"] });
  assert.deepEqual(api.pauseReasons(s), ["allOffline"], "ann still in and gone");
  s = api.refresh(s, 2_000, { hostId: null, running: true, roundOver: false, activeIds: [] });
  assert.deepEqual(api.pauseReasons(s), [], "nobody in: nothing to wait for");
  assert.equal(api.pausedSince(s), null);
});

test("refresh while the activity is not running only applies silence: pause flags are left alone", () => {
  const s = api.refresh(api.setManualPause(table(), true, 5), 99_000, { hostId: "host", running: false, roundOver: false, activeIds: [] });
  assert.equal(api.isConnected(s, "ann"), false);
  assert.deepEqual(api.pauseReasons(s), ["manual"]);
  assert.equal(api.pausedSince(s), 5);
});

test("hostAbsentRule continue means a gone host does not pause", () => {
  const keep = createPresenceApi({ hostAbsentRule: "continue" });
  const s = keep.refresh(keep.away(table(), "host"), 10, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.deepEqual(keep.pauseReasons(s), []);
});

test("manual pause: without a time the start is filled in by the next refresh; with one it is recorded; lifting clears it", () => {
  let s = api.setManualPause(table(), true);
  assert.deepEqual([api.isManualPause(s), api.isPaused(s), api.pausedSince(s)], [true, true, null]);
  s = api.refresh(api.seen(api.seen(s, "host", 50), "ann", 50), 50, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.equal(api.pausedSince(s), 50);
  assert.equal(api.setManualPause(s, true), s);
  s = api.setManualPause(s, false, 60);
  assert.deepEqual([api.isManualPause(s), api.pausedSince(s)], [false, null]);
  assert.equal(api.pausedSince(api.setManualPause(table(), true, 7)), 7);
});

test("restart keeps the named participants with sitting out and misses cleared and no pauses or holds", () => {
  let s = table();
  s = api.sitOut(api.recordMiss(s, "ann"), "ann");
  s = api.setHold(api.setManualPause(s, true, 3), "host", "learn", { running: true, roundOver: false });
  const r = api.restart(s, ["host", "ann", "ghost"]);
  assert.deepEqual(r.participants.map((p) => p.id), ["host", "ann"]);
  assert.deepEqual([api.isSittingOut(r, "ann"), api.misses(r, "ann")], [false, 0]);
  assert.deepEqual([api.isPaused(r), api.isHeld(r), api.pausedSince(r)], [false, false, null]);
  assert.equal(r.hostId, null);
  assert.equal(restart(setHost(s, "host"), ["host"]).hostId, "host");
  assert.equal(restart(setHost(s, "host"), ["ann"]).hostId, null);
});

test("nextWake is the silence rule only, never the drop period, and none for live connections or computers", () => {
  let s = table();
  assert.equal(api.nextWake(s), 30_001);
  assert.equal(api.nextWake(api.seen(api.seen(s, "host", 10_000), "ann", 5_000)), 35_001);
  s = api.setLive(api.setLive(s, "host", true, 0), "ann", true, 0);
  assert.equal(api.nextWake(s), null);
  const gone = api.refresh(api.away(api.away(s, "host"), "ann"), 1_000, { hostId: "host", running: true, roundOver: false, activeIds: ["host", "ann"] });
  assert.deepEqual(api.pauseReasons(gone), ["hostAbsent", "allOffline"]);
  assert.equal(api.nextWake(gone), null, "the drop deadline is the engine's stale rule, not a presence wake-up");
  assert.equal(nextCheck(gone, api.settings), 1_000 + 1_800_000, "nextCheck still reports it");
  assert.equal(nextSilence(table(), { ...settings, awayAfterSeconds: 5 }), 5_001);
});

test("settings are bound once and checked", () => {
  assert.deepEqual(createPresenceApi().settings, { awayAfterSeconds: 30, dropAfterSeconds: 1800, hostAbsentRule: "pause" });
  assert.deepEqual(validateSettings({ awayAfterSeconds: 5 }), { awayAfterSeconds: 5, dropAfterSeconds: 1800, hostAbsentRule: "pause" });
  for (const bad of [{ awayAfterSeconds: 0 }, { dropAfterSeconds: 1.5 }, { hostAbsentRule: "shrug" as never }]) assert.throws(() => validateSettings(bad), RangeError);
  const quick = createPresenceApi({ awayAfterSeconds: 5 });
  assert.equal(quick.nextWake(quick.register(quick.create(), "a", 100, "person")), 5_101);
});

test("refreshFor with an unchanged table returns the same object", () => {
  const s = api.refresh(table(), 10, running);
  assert.equal(refreshFor(s, 10, api.settings, running), s);
});
