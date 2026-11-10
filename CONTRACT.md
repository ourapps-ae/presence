# Presence component

## Purpose and facilities
`presence` tracks which participants of a shared activity are present. A participant is present while they make requests or hold a live connection; one who is silent for longer than the away period (and has no live connection) becomes absent. From who is absent it derives pause flags: the host being absent pauses the activity or not according to a rule, everyone counted being absent pauses it, and a manual pause can be set and lifted. When everyone has been absent for the drop period `abandoned` says so and the caller ends or clears the activity. All functions are pure over a plain state and take the clock as an argument. It is the one owner of pause and hold state: besides the automatic pauses, a person can sit out, leave a running activity, or hold the clock to look at a result (`look`) or read a guide (`learn`); a hold ends with its person's connection.

Facilities: `presence` (Present and absent tracking with pause and abandon rules).

## User inputs
Three settings. `awayAfterSeconds` (default 30) is the silence after which a participant without a live connection is absent; it should be longer than one polling round trip. `dropAfterSeconds` (default 1800) is how long everyone counted may be absent before `abandoned` is true. `hostAbsentRule` (default `pause`) is `pause` to pause while the host is absent or `continue` to carry on without them.

- `awayAfterSeconds` (integer; optional; default `30`)
- `dropAfterSeconds` (integer; optional; default `1800`)
- `hostAbsentRule` (string, identifier; optional; default `pause`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/presence/`:

- `implementation/server/presence.ts` -> `components/presence/server/presence.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0. Licence wording remains deferred.

## Provided interfaces
- `interfaces/presence.json` defines `presence` (ae/presence) version 1.0.0 as an OpenRPC 1.3.2 document: one method per exported function of `server/presence.ts` and one `PresenceApi.*` method per function of the object `createPresenceApi` returns, with `PresenceState`, `PresenceSettings` and the other types as JSON Schema 2020-12; `validateSettings` and `createPresenceApi` list the `RangeError` they throw.

## Required interfaces
- `guest-identity` (ae/guest-identity) version 1.0.0, supplied by the recipe or application; `interfaces/required-guest-identity.json` is a copy of guest-identity's interface document.

## Integration
The room keeps one `PresenceState` beside its activity state. `createPresenceApi(settings)` returns the object a turn engine calls, with the away and drop settings bound: `create`, `register(state, id, now, 'person'|'computer')`, `unregister`, `restart(state, keepIds)`, `seen`, `setLive`, `away`, `sitOut`, `returned`, `leftGame`, `recordMiss`, the readers `isConnected isLive isSittingOut misses lastSeen`, `refresh(state, now, {hostId, running, roundOver, activeIds})`, `setManualPause`, `setHold`, `isHeld`, `holds`, `isPaused`, `pauseReasons`, `isManualPause`, `pausedSince` and `nextWake` (the next silence deadline). Before acting the engine calls `refresh`; it then decides which clocks run (not paused and not held) and gives game-clock run flags; presence, not game-clock, records who is paused or holding. The module functions are the same without bound settings (`refreshFor`, `nextSilence`); `refresh(state, now, settings, active)` is the module function for a room with no engine. Ask `nextCheck` (or `nextWake`) for the wall time to set the room's alarm for, and `abandoned` to end an idle paused activity. Participant ids are the identities of the guest-identity component; computers are registered as automatic. `examples/consumer.ts` runs a host dropping and returning without any game.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are in `visual/output/`.

## Infrastructure
No service. State is plain data held by the caller.

## Verification
Required-local: `node --test tests/server.test.ts` checks the silence boundary, live connections, returning, the host rule both ways, all-absent pausing and abandoning, participants that do not count, manual pause, the inactive mode, the next-check time, purity of every function and the example; and the engine layer: register by kind, sitting out and returning, leaving, the readers on known and unknown ids, holds (who may hold, when, ending with the connection, ending when the activity stops), refresh with an engine's context, restart, nextWake as the silence deadline only, bound settings, same-object results when nothing changes, and a state saved by 0.1.0. No Swift or Kotlin suites: the component is server-side only.

- `node --test tests/server.test.ts` (server, required-local; tools: node 26.5.0)

## Scenarios and presentation
A phone goes to the background: the app reports `away`, the host is absent and the room pauses with `hostAbsent`. The host returns: the next request calls `seen` and the pause clears. All players close their tabs: the room pauses with `allOffline`; after the drop period the room is abandoned and cleared. With `hostAbsentRule` set to `continue` the host leaving changes nothing.

## Updates and removal
Patch updates replace files; no persisted-state migration. The state is short-lived (a room's presence flags) and is rebuilt as participants are seen again, so there is no migration.json.
