# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Paths are under the `recipe/` folder of `ourapps-ae/OurPoker`.

## Files

- `implementation/server/presence.ts` <- `server/src/engine.ts`:
  - `seen`: lines 252-262. Same rules; the player record becomes `Participant`, `absentMisses` becomes `misses`.
  - `setLive`: lines 289-302. Same rules; `bot` becomes `automatic`.
  - `away`: lines 304-310.
  - `isPaused`, `pauseReasons`: lines 183-193.
  - `refresh` (`refreshPauses`): lines 464-478 for silence beyond `PRESENCE_MS` and the pause flags. `PRESENCE_MS` 30 000 (line 25) becomes `awayAfterSeconds` 30; the host rule (`hostAbsent = host exists and not connected`) becomes `hostAbsentRule` `pause` or `continue`; "humans still in" (`inPlayers` not bot) becomes `counts` and not `automatic`; the `status !== "running"` early return becomes the `active` argument.
  - `abandoned`: lines 489-492 (paused with nobody connected for `STALE_MS`). `STALE_MS` 30 minutes (line 27) becomes `dropAfterSeconds` 1800. The recipe cancels the tournament there; here the function only says so.
  - `nextCheck` (`nextWake` presence parts): lines 582-593.
  - `recordMiss`, `silentIds`, `absentIds`, `setManualPause`, `setCounts`, `addParticipant`, `removeParticipant`, `setHost`, `createPresence`: new accessors (`generated-platform`) so a caller can keep the state without the poker `Game`. The immutable style follows the recipe (`structuredClone` there, object spreading here).
- Platforms: server only. The recipe has no presence logic on web, Apple or Android beyond sending the away request (`ios/OurPoker/Sources/TableClient.swift` lines 59-64, `android/.../net/TableClient.kt` lines 55-59, `web/src/store.ts` lines 254-261); those calls belong to the application's client and the room-session transport, so no native code is extracted.
- Engine layer in the same file (`generated-adapter`, written to `interfaces/required-presence.json` in `ourapps-ae/turn-engine`):
  - `setHold`, `isHeld`, `holds`: `server/src/engine.ts:270-287` (`HoldKind`, `setHold`, `isHeld`). Same conditions (a person, running, a look only after a result, same kind changes nothing). The map `holds[playerId]` becomes an ordered list; `isHeld` no longer tests `status === "running"` because `refreshFor` clears holds when not running.
  - `refreshFor`: `engine.ts:464-478` (`refreshPauses`): holds of players gone or away end, looks end once the result is no longer up, then host and everyone-gone flags from the people still in; `activeIds` replaces `inPlayers(g)`, `hostId` replaces `g.hostId`.
  - `sitOut`, `returned`, `leftGame`, `isSittingOut`: `engine.ts:337-345` (`sitOut`, `return` actions: `sittingOut`, `absentMisses = 0`, `connected = true`, `lastSeen = now`) and `engine.ts:432-445` (`leave` while running: `sittingOut = true; connected = false`).
  - `restart`: `engine.ts:375-402` (`start` clears `sittingOut`, `absentMisses`, `pause`, `pausedSince`) and `backToLobby`.
  - `nextSilence`: the silence part of `engine.ts:582-593`, without the stale deadline the engine keeps itself.
  - `createPresenceApi`, `register`, `unregister`, `create`, readers (`isConnected`, `isLive`, `misses`, `lastSeen`, `isManualPause`, `pausedSince`), `validateSettings`: new, one-line bindings over the existing functions.

## Left behind in the recipe

- Which clocks run while paused or held, `tick`, `advance`, cancel on abandon, going back to the lobby (`doCancel`, `backToLobby`) and `LOBBY_DROP_MS` (line 34) with the lobby seat dropping at lines 497-502 and 583-586: they belong to the turn engine and seating. `silentIds` lets seating apply a shorter lobby rule.
- Bot move timing (`botDue`, lines 574-580) and everything poker.
