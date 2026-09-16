# Logicals on ChatGPT Sites: Runtime Generation and Two-Player Duels

Date: 2026-09-16
Status: Approved design pending document review
Repository: jonasyr/-german-logic-puzzle-generator

## 1. Purpose

Move the current German Logicals web app to ChatGPT Sites while preserving its deliberately optimized iPhone and iPad experience. Puzzles continue to be generated at runtime. The first Sites release adds persistent player profiles, personal result history, and a two-player duel in which two people solve the same generated puzzle independently on different devices.

PDF generation is explicitly deferred. The existing PDF-related boundaries should remain recognizable so the feature can be added later without redesigning the game flow.

## 2. Non-negotiable product constraints

- The existing webapp directory is the visual and interaction source of truth.
- Do not rebuild the app in React or replace the current interface with a generic Sites starter.
- Preserve the existing responsive behavior, typography, spacing, colors, dark mode, PWA metadata, dialogs, play grid, pager, clue sheet, timer presentation, and local game recovery.
- Preserve safe-area handling for notched devices and the existing iOS interaction fixes.
- Preserve touch targets of at least 44 points, input font sizes that avoid Safari focus zoom, gesture cancellation while scrolling, and protection against double-tap zoom on playable cells.
- Puzzle generation remains deterministic and occurs at runtime.
- PDF export is not part of the first release.
- A duel contains exactly two players, one puzzle, separate grids, and a shared start time.
- No user accounts, passwords, global leaderboard, player administration, chat, spectators, or live transfer of grid marks are included.

## 3. Existing system to preserve

The current app is a vanilla HTML, CSS, and JavaScript application under webapp. It contains the start, settings, result, and play screens. Its play mode already handles three-state cells, validation, completion detection, timer behavior, pause behavior, localStorage recovery, undo, responsive grid layouts, confirmation dialogs, and clue-sheet gestures.

The deterministic TypeScript engine under src remains the only puzzle-generation implementation. The Sites port must call the same generation code and must not introduce a second generator or an alternate source of puzzle truth.

The older React application under site is not the implementation target. It may inform bundling choices, but its UI must not replace the current German Logicals frontend.

## 4. Architecture

### 4.1 Frontend

Keep the existing webapp markup, stylesheets, modules, and assets. Add only the screens and controls needed for player selection, duel creation and joining, the duel lobby, duel results, and personal history. New controls must use the same iOS grouped-list, button, dialog, spacing, color, and safe-area conventions as the existing app.

A lightweight build layer bundles the current frontend together with the TypeScript puzzle engine. It must not require a component-framework migration.

### 4.2 Runtime puzzle generation

Move booklet generation from the current Node server worker thread to a browser Web Worker. The worker imports the existing TypeScript engine and generateGermanLogicBooklet implementation.

The existing API-facing frontend boundary should remain stable where practical. The generation client returns the same booklet-shaped data currently returned by POST /api/booklet, allowing settings, result rendering, and play screens to remain unchanged.

Generation runs off the main thread so scrolling, animations, dialogs, and touch handling remain responsive on iPhone and iPad. Determinism tests must confirm that the same effective configuration and seed produce the same puzzle fingerprint across two devices.

### 4.3 Sites backend and persistence

Use a Cloudflare Worker-compatible Sites backend with D1 persistence. The backend stores players, duel rooms, room membership, and completed results. It does not generate puzzles and does not receive or store individual grid marks.

The public room code is a convenience identifier, not an authentication credential. The deployment audience is managed separately through Sites access controls. The Site remains owner-private unless the owner explicitly changes access for the second player.

### 4.4 Synchronization model

Use one-second short polling for lobby state and final-result state, with slower retry after transient failures. Live cell synchronization and WebSockets are unnecessary because players have separate grids. Polling must stop when leaving a room or when the room reaches a terminal state.

The backend establishes one authoritative starts_at timestamp four seconds in the future after both members are loaded and ready. Each device renders the countdown and elapsed duel time from that timestamp rather than from the duration of its local generation work.

## 5. Player experience

### 5.1 Player profiles

The start screen adds an iOS-style “Spielen als …” selector above the primary actions.

- Users can select an existing player or create a new one with a plus action.
- If no player exists, creation opens automatically.
- Names are trimmed and unique without regard to capitalization.
- A display name contains 1 to 40 Unicode characters after trimming. Normalization uses Unicode NFKC, collapses internal whitespace, and applies German locale-aware lowercase comparison while preserving the entered display form.
- A duplicate creation attempt returns and selects the existing profile rather than creating another record.
- The selected player ID is remembered locally on the device.
- Player deletion, renaming, passwords, avatars, and administrative roles are out of scope.

### 5.2 Start choices

After selecting a player, the start screen offers:

- Alleine spielen
- Duell spielen

Solo play retains the existing settings, generation, result selection, play, pause, and local recovery behavior.

Duell spielen offers:

- Duell erstellen
- Raumcode eingeben

### 5.3 Personal history

The selected player can open a simple personal history. Results are ordered newest first and show puzzle title, difficulty, completion time, failed checks, and completion date. There is no cross-player ranking outside the final comparison for a single duel.

## 6. Solo flow

Solo generation and play behave as they do today, except generation executes in the browser Web Worker and completed results are persisted.

The solo pause button continues to pause both the grid and elapsed time. Existing localStorage progress remains device-local. On completion, one result is saved for the active player.

## 7. Duel flow

### 7.1 Host flow

1. The host selects a player and chooses Duell erstellen.
2. The host uses the existing settings screen and runtime generation flow.
3. The existing result screen shows the generated puzzles.
4. Selecting “Spielen” for one puzzle creates a room bound to the effective booklet configuration, the booklet seed, the selected puzzle index, and a deterministic puzzle fingerprint.
5. The lobby displays a six-character uppercase room code without visually ambiguous characters and a shareable join link.

### 7.2 Guest flow

1. The guest selects a different player.
2. The guest opens the join link or enters the room code.
3. The app validates that the room exists, has not expired, has not started, and has a free guest slot.
4. The guest device generates the exact room configuration in its Web Worker and selects the room’s puzzle index.
5. The generated fingerprint must equal the host fingerprint before the guest can become ready.

### 7.3 Lobby and start

- A room accepts exactly one host and one guest.
- The same player cannot occupy both slots.
- Each client reports loaded only after local generation and fingerprint verification succeed.
- Each player explicitly presses Bereit.
- When both players are loaded and ready, the backend atomically assigns starts_at four seconds in the future.
- Both clients display a synchronized countdown and unlock their separate grids at starts_at.
- After starts_at, no new player may join and neither room membership nor the puzzle payload may change.

### 7.4 During the duel

- Each device keeps its marks, undo history, clue state, and validation state locally.
- No marks or intermediate progress are sent to the other player.
- A failed check is one press of Prüfen that reveals at least one incorrect mark. The number of wrong cells does not multiply the failed-check count.
- The duel pause action may cover and lock the local grid, but the authoritative duel clock continues running.
- Solo pause behavior is unaffected.
- A temporary connection loss does not interrupt local play.

### 7.5 Completion

- Completion uses the existing local solution-validation rules.
- The puzzle fingerprint is a SHA-256 digest of a canonically serialized puzzle payload containing categories, clues, target question, and solution rows while excluding presentation timestamps and other mutable metadata.
- The client submits the player, room, puzzle fingerprint, elapsed time, failed-check count, and a per-attempt idempotency key.
- The backend accepts at most one result per room member and attempt key.
- The first finisher sees their result and a waiting state.
- When both results exist, both devices show a direct comparison with names, times, failed checks, and the winner.
- Primary ranking uses completion time. If completion times are equal at stored precision, fewer failed checks wins. If both values are equal, the duel is a tie.

## 8. Persistence model

### 8.1 players

- id
- display_name
- normalized_name, unique
- created_at

### 8.2 rooms

- id
- code, unique
- host_player_id
- configuration_json
- booklet_seed
- puzzle_index
- puzzle_fingerprint
- state: waiting, countdown, active, complete, expired
- starts_at
- expires_at
- created_at

### 8.3 room_members

- room_id
- player_id
- role: host or guest
- loaded_at
- ready_at
- joined_at

The pair of room_id and player_id is unique, and each room allows one member per role.

### 8.4 results

- id
- player_id
- room_id, nullable for solo play
- attempt_key, unique
- puzzle_fingerprint
- puzzle_title
- theme_id
- difficulty
- seed
- configuration_json
- elapsed_ms
- failed_checks
- completed_at

Every intentional solo replay receives a new attempt key and therefore a new result. A duel permits only one accepted result per room member.

## 9. Backend operations

The backend exposes narrowly scoped JSON operations for:

- listing players
- creating or resolving a player by normalized name
- listing one player’s results
- creating a duel room
- joining a room
- reporting local generation as loaded
- setting ready state
- reading room state
- submitting a solo or duel result
- reading the final duel comparison

Every write validates types, lengths, room state, player membership, puzzle fingerprint, and idempotency. Client-provided display fields never override canonical room data for duel results.

## 10. Offline and error behavior

- Cache the last successful player list and selected player on the device.
- Existing solo play and already-generated duel play continue through a temporary connection loss.
- Completed results that cannot be submitted are placed in a local outbox and retried on the next app start and when connectivity returns.
- An outbox item keeps its attempt key so retries cannot create duplicates.
- Creating a player, creating a room, or joining a new room requires connectivity and shows a concise German error without discarding current local state.
- Joining a full, started, expired, unknown, or fingerprint-mismatched room shows a distinct recoverable message.
- If one duel participant never finishes, the other may leave after seeing their locally secured result. The pending room expires automatically after 24 hours.

## 11. Privacy and access

The first release stores only player names and game results. It does not collect email addresses, passwords, chat content, device identifiers, or detailed interaction logs.

Room codes must not be presented as security boundaries. A second person can use the Site only after the owner grants appropriate Sites access or changes the Site audience. No deployment audience change is part of implementation without an explicit owner request.

## 12. PDF deferral

The PDF action is unavailable in the first Sites release. Remove no reusable booklet or PDF-domain interfaces merely to hide the action. The UI must not promise a working download. A later phase may replace the Python ReportLab renderer with a compatible service or browser-capable renderer.

## 13. Testing and acceptance

### 13.1 Automated behavior tests

- Same configuration and seed produce the same fingerprint in the main thread, generation worker, and a second worker instance.
- Player names are normalized and duplicates resolve to one profile.
- A room accepts exactly two distinct players.
- A room cannot start before both clients are loaded and ready.
- starts_at is assigned once and is identical for both clients.
- A participant cannot join or switch after countdown begins.
- Marks and local game state never cross between players.
- Failed checks increment once per unsuccessful validation action.
- Solo pause stops solo time; duel pause does not stop duel time.
- One duel member can submit only one result.
- Result retries are idempotent.
- Winner and tie rules are deterministic.
- Expired rooms reject joins and writes.
- Offline outbox retries retain the original attempt key.

### 13.2 Existing regression tests

- Preserve all engine, determinism, booklet, play-logic, and server-independent tests that remain applicable.
- Add focused tests before each production behavior change.
- Do not modify the generator’s deterministic behavior to accommodate hosting.

### 13.3 Visual and device verification

Verify light and dark modes with representative safe-area insets and no console errors on:

- a small iPhone viewport
- a current standard iPhone viewport
- a large iPhone viewport
- phone landscape
- iPad portrait
- iPad landscape
- desktop

For each relevant state, confirm:

- no unintended horizontal overflow
- no regular interactive text below 16 pixels where Safari focus zoom applies
- no touch target below 44 points
- safe-area padding is correct on asymmetric landscape insets
- the clue sheet exposes no clue content at peek and retains its existing detent gestures
- play-cell taps do not fire after a scroll gesture
- pager and full-grid layouts remain unchanged
- player selector, lobby, waiting state, duel result, and history use the established visual language

## 14. Delivery sequence

1. Establish the Sites-compatible build while rendering the current app unchanged.
2. Move runtime generation into the browser Web Worker and prove deterministic equivalence.
3. Add D1 schema and tested backend operations.
4. Add player selection and personal history.
5. Add duel creation, joining, lobby, synchronized start, result persistence, and comparison.
6. Run automated and device-focused regression verification.
7. Publish the Site privately without changing its audience.
8. Handle access for the second player only after the owner explicitly selects the desired audience or viewer.

## 15. Definition of done

The work is complete when the current iOS-optimized Logicals experience is available on ChatGPT Sites, runtime generation remains deterministic and responsive, solo play still works, two selected players can start the same puzzle on separate devices with a synchronized countdown and independent grids, completed results persist and appear in personal history, duel comparison is correct, offline result retries are safe, the established iPhone and iPad behavior passes regression checks, and the deployed Site is reachable under its preserved access policy.
