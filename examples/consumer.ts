import { abandoned, addParticipant, away, createPresence, nextCheck, pauseReasons, refresh, seen, setLive, type PresenceSettings, type PresenceState } from "../implementation/server/presence.ts";

// A room with a host and a guest: the host's connection drops, the room pauses, and the host
// coming back lets it carry on. The clock is passed in, so the room can sleep between checks.
export function hostDropsAndReturns(settings: PresenceSettings) {
  let state: PresenceState = createPresence("host");
  state = addParticipant(state, { id: "host" }, 0);
  state = addParticipant(state, { id: "guest" }, 0);
  state = setLive(state, "host", true, 0);
  state = setLive(state, "guest", true, 0);
  state = refresh(state, 1_000, settings);
  const running = pauseReasons(state);
  state = setLive(state, "host", false, 2_000);
  state = away(state, "host");
  state = refresh(state, 2_000, settings);
  const whileAway = pauseReasons(state);
  const wake = nextCheck(state, settings);
  state = seen(state, "host", 5_000);
  state = refresh(state, 5_000, settings);
  return { running, whileAway, wake, afterReturn: pauseReasons(state), abandoned: abandoned(state, 10 ** 9, settings) };
}
