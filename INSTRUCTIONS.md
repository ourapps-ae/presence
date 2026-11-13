# Presence instructions

## For the agent
Select this component for any application that must pause or end an activity when people leave. Set `awayAfterSeconds` longer than the longest interval between a present client's requests, and choose the host rule. Connect the guest-identity requirement so participant ids are the identity ids. Pass the presence flags to the turn-taking engine so it stops clocks while paused.

- Select package `ourapps-ae/presence` version `0.5.0`.
- Settings to configure:
  - `awayAfterSeconds` (integer; optional; default `30`)
  - `dropAfterSeconds` (integer; optional; default `1800`)
  - `hostAbsentRule` (string, identifier; optional; default `pause`)
- Connect the provided `presence` (ae/presence 1.0.0) to the consumer that needs it.
- Supply `guest-identity` (ae/guest-identity 1.0.0) from the component that provides it.
- No accounts or keys are needed.

## For the developer
Store the `PresenceState` with the room's other state and call `refresh` before every decision and in the room's alarm. Add each participant with `addParticipant` when they join and call `removeParticipant` when they leave. Supply no accounts or keys. With a turn engine use `createPresenceApi(settings)` and pass its results, not game-clock pause flags, to the clock: presence owns pauses and holds.

## How to check
From the component directory:

- `node --test tests/server.test.ts` (server, required-local; tools: node 26.5)
- `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network` checks an archive fetched with `python3 -m aepm fetch ourapps-ae/presence@VERSION --store STORE --from https://ourapps.app` and runs its suites.
