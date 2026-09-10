# Slime

A desk pet that lives on top of your screen and gets agitated when a Google Meet is about to start.

Everything you see is simulated, not animated: there are no sprites, no frames and no art assets in
this repo. The body is a soft-body physics ring and the face is drawn from primitives, which is
exactly why a slime was the right character — squash and stretch *is* the animation language, so a
blob gets expressive behaviour out of physics that a cat would need a rigged skeleton and an artist
to match.

## Stack

Tauri 2 + TypeScript, Canvas 2D, Rust backend.

Tauri over Electron because this thing runs all day: it uses the system WebView2 that Windows
already ships, so it idles at roughly a third of what an Electron build of the same app would.
Everything a desk pet needs — a transparent always-on-top window, click-through, a tray icon — is
native to it, and the Rust side is where the OAuth loopback listener belongs anyway.

## Running it

```bash
npm install
npm run tauri dev
```

To build an installer:

```bash
npm run tauri build
```

## How the overlay works

The window covers the entire primary monitor. That is what lets the slime roam anywhere, sit on any
part of the screen, and be thrown across it — rather than living in a small window that would have
to be repositioned over IPC on every frame.

It is sized to the monitor's **work area**, not the full monitor, so it never covers the taskbar.
That is a deliberate floor on how bad a click-handling bug can get: whatever else breaks, the tray
icon stays clickable and Quit is always reachable.

Covering the screen means the window must not eat input, so:

- It is `ignore_cursor_events(true)` by default. Every click passes straight through to whatever is
  underneath.
- The frontend knows where the slime actually is, so each frame it decides whether the pointer is
  over the body or the bubble, and **asks** for clicks while it is.
- While click-through is on, the window receives no mouse events at all — which is why Rust polls
  the global cursor position at 30 Hz and pushes it to the frontend. That stream is what lets the
  slime's eyes follow your pointer even when it cannot be clicked.

### Clicks are a lease, not a latch

"Accepting clicks" is a dangerous state: while it is on, every click in the work area lands on a
transparent window instead of on what the user aimed at. So it is held as an expiring lease.
`hold_clicks` extends it by 400 ms and the frontend renews every 150 ms; a watchdog on the Rust side
checks at 10 Hz and reverts to click-through the moment the lease lapses. `release_clicks` exists
only to make letting go feel immediate — if it never arrives, nothing is lost.

This is not defensive decoration. The first version had the frontend cache the current mode and skip
the IPC call when it believed the mode already matched, which desynchronises **permanently** on a
webview reload: the page's cached flag resets to "click-through" while the Rust process is still set
to accept clicks, so the frontend concludes there is nothing to send and goes silent forever. The
result is an unclickable desktop with no way back — and in the first version the overlay also covered
the taskbar, so the tray could not be reached to quit it either. A vite HMR reload during development
triggers it every time the pointer happens to be over the slime.

Under a lease, every one of those failure modes — reload, crash, thrown exception, frozen render
loop, rejected IPC call — costs at most one lease period of swallowed clicks and then heals itself.

`ignore_cursor_events` maps to `WS_EX_TRANSPARENT` on Windows, so the real state can be read from
outside the process with `GetWindowLongW(hwnd, GWL_EXSTYLE) & 0x20`. That is how the behaviour above
was verified rather than assumed, and it is the way to check it if this ever regresses.

The coordinate conversion between the two is easy to get subtly wrong: the cursor arrives in
physical screen pixels, and the canvas draws in CSS pixels relative to the window. Both the window
origin and the display scale factor are needed. Miss the origin and the gaze is offset on a
secondary monitor; miss the scale factor and the gaze drifts further off the further the pointer is
from the top-left corner.

## The soft body

`src/slime/Blob.ts` is a ring of 40 points, each free to move radially, each pulled back to the rest
radius by a spring and coupled to its two neighbours.

The neighbour coupling is the whole trick. Without it, a poke dents one point and that point springs
back — a circle being deformed. With it, the dent propagates around the ring and back, which is what
reads as jelly. Neighbour values are read from a snapshot each step rather than in place, or the
wave travels a full lap per frame and buzzes instead of wobbling.

Global squash is kept separate from the ring and is volume-preserving (`sx = 1/sy`). That is what
makes a landing look like a landing rather than the slime briefly shrinking.

Everything else is built on those two pieces: landings poke the contact point and squash the body,
jumps stretch it, a drag elongates it along its travel direction into a droplet, and the contact
shadow shrinks with altitude — which is most of what actually sells the jump.

## Behaviour

`src/slime/Slime.ts` holds the state machine: idle, happy, sleepy, asleep, surprised, alert,
dragged. Colour is reserved for state (calm teal, alert amber, sleeping blue) because that is the
one thing that has to read instantly from the corner of your eye.

The idle scheduler mostly decides to do nothing. That is deliberate — a pet that fidgets constantly
is exhausting to have on screen, so stillness is the common case and movement is the exception. It
falls asleep after about 95 seconds of being left alone, and wakes when poked or when a meeting is
coming.

- **Drag** it to move it. Release with speed to throw it; it bounces off the walls and floor.
- **Click** it to poke it, or to join the meeting while it is bouncing.
- **Right-click** it to open settings.

A press is a poke if it was under 260 ms and moved less than 6 px; anything else is a throw.

## Meeting reminders

There is no Meet API. A Meet link is a property of a calendar event — `hangoutLink`, or a `video`
entry in `conferenceData` — so this reads Google Calendar events and nothing else. The scope
requested is `calendar.events.readonly`: Slime cannot change your calendar.

The Rust poller (`src-tauri/src/calendar.rs`) checks every 45 seconds, and five minutes before an
event with a video link it emits `meeting-soon`. The slime swells, turns amber, and bounces on a
beat — a steady pulse rather than continuous motion, because constant movement is the thing you
learn to tune out. Clicking it opens the link.

Announcements are deduped by event id plus start time, so a rescheduled meeting is announced again
but a 45-second poll does not re-trigger the same one.

### Connecting your Google account

You need your own OAuth client — this app has no shared one, and a client ID baked into a
distributed binary would be a credential anyone could extract.

1. In the Google Cloud console, create or pick a project.
2. Enable the **Google Calendar API**.
3. On the OAuth consent screen, add your own account as a **test user**. The calendar scope is a
   sensitive one, so an app in testing mode only works for listed users.
4. Under Credentials, create an **OAuth client ID** of type **Desktop app**. There is no redirect
   URI to fill in: desktop clients are allowed to use loopback, which is what Slime listens on.
5. Paste the client ID and secret into Slime's settings, then press Connect.

The flow is PKCE on a loopback listener bound to `127.0.0.1` on an OS-assigned port, so two
instances can never collide and nothing off-machine can reach it. Google issues a secret even for
desktop clients and it genuinely cannot be kept secret in a distributed program, which is precisely
why the flow uses PKCE — security rests on the per-attempt verifier, not on that value.

Tokens and the client credentials go into the Windows Credential Manager via the `keyring` crate,
not a config file. The `state` parameter is checked on the callback, and a `400` from a refresh
clears the stored tokens so the UI says "not connected" instead of retrying a revoked grant forever.

Two smaller deliberate choices: `open_external` refuses anything that is not `https://`, and the
settings list renders event titles with `textContent`. Both are because a calendar invite is data
controlled by whoever can put an event on your calendar.

## Developing it

Two handles are attached to `window` for use from a devtools console:

- `__slime` — the live simulation object, for reading position, velocity and mood.
- `__simulateMeeting(minutes, title)` — fires the whole reminder performance immediately. Tuning the
  alert animation is otherwise gated on an actual calendar entry, which makes it untunable.

**You cannot screenshot the overlay with a normal screen capture.** It is a transparent WebView2
window, so it is layered and DirectComposition-rendered: `BitBlt` from the screen DC omits it
entirely, and `PrintWindow` (even with `PW_RENDERFULLCONTENT`) comes back solid black. Both fail
silently, which looks exactly like the app having failed to draw. To check the rendering, open
`http://127.0.0.1:1420/index.html` in an ordinary browser while `tauri dev` is running — the Tauri
calls fail there and are handled, and everything visual behaves the same.

## Status

Verified: the Rust side compiles clean, TypeScript typechecks, the production bundle builds, and the
app runs at about 69 MB resident. The slime renders and simulates, tracks the cursor, and the full
reminder performance was confirmed visually — amber body, wide eyes, airborne with the contact
shadow shrinking away, speech bubble anchored to it.

**Not verified end to end:** the Google OAuth round trip and the calendar poll. Both are written and
compile, but they need a real OAuth client ID pasted into Settings, which is yours to create — I
should not be handling your credentials. Until then the poller idles, which is its normal state on a
fresh install.

Not built yet:

- Drag, throw and poke are wired and typecheck, but have only been exercised through synthetic
  events — they want a few minutes of actual mouse-in-hand testing.
- Reminder lead time is hardcoded at 5 minutes, and there is no settings control for it.
- Multi-monitor: the overlay is pinned to the primary monitor only.
- No autostart-on-login registration.
- No sound.
- The slime does not know about window edges, so it walks along the bottom of the screen rather than
  sitting on top of your windows.
