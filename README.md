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

The window covers the primary monitor. That is what lets the slime roam anywhere, sit on any part
of the screen, and be thrown across it — rather than living in a small window that would have to be
repositioned over IPC on every frame.

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

## Rendering cost

The backing store is sized to the window's real device pixels — 3840x2088 on this display, eight
megapixels. Clearing and repainting all of it every frame, which for a transparent always-on-top
window also means DWM recompositing all of it, is far more expensive than the drawing itself, and
the slime occupies about two hundred pixels of it.

So each frame repaints only the union of this frame's bounds and last frame's: this frame's to draw
into, last frame's to erase what is no longer there. Measured on a 2560x1392 work area that is
**1.2% of the surface per frame** instead of 100%. The body gradient is also built once per palette
rather than per frame.

Beware of measuring the DPI relationship with Win32 tools. A process that is not per-monitor DPI
aware sees virtualised window rects: `GetWindowRect` reports this window as 2560 wide, the CSS
viewport is also 2560, and the ratio looks like 1 when it is really 1.5. That misreading is what
briefly convinced me the backing store was 2.25x oversampled, which it is not.

## Standing down when nothing is happening

This app is open all day, and it was costing **31% of a core to sit still**. Measured by simply
stopping the frame loop, that cost was almost entirely the loop itself: with it stopped the process
idled at 4.2%. Every frame that touches the canvas makes the compositor recombine an eight-megapixel
transparent layer over the whole desktop, whether any pixel changed or not.

So the loop now stands down. It drops to a 20 Hz tick when nothing is happening, and a tick where
nothing visible changed does not paint at all. **Idle went from 31.2% of a core to 4.0%** — the floor
measured with the loop stopped entirely, so idle rendering now costs essentially nothing.

Three things this has to get right, each of which was wrong in the first attempt:

- **The "is anything moving" test has to be against the target the eyes are actually easing toward.**
  The first version compared the eye position against the *idle jitter* target, which is never what
  they are chasing while a pointer is on screen — so it always answered "yes" and the whole
  stand-down silently never engaged. Idle CPU was unchanged, which is how it was caught.
- **A trailing paint after motion stops.** The frame that first reports nothing moving is the frame
  that has to settle the image; skip it and the screen keeps whatever was drawn mid-movement.
- **Sleep is slow, not static.** The drifting "z" marks never stop, so an asleep slime always needs
  painting — but at 20 Hz, which looks identical and costs a third as much. That is a separate
  question from whether the loop needs full frame rate, so it is a separate flag.

Cursor tracking is also range-gated (520 px). The eyes easing toward a new target counts as
animating, so following the pointer anywhere on a 2560-wide screen held the loop at full rate
whenever the mouse twitched. A pet that tracks something across the room reads as staring anyway.

Hover wakes the loop on the same frame rather than up to an idle interval later, because the wake
test uses the live cursor position rather than last frame's paw state.

### The window is full-screen on purpose, and shrinking it is not worth it

The obvious next optimisation is to stop being a full-screen transparent window at all: make it a
small window that follows the slime, so the compositor has a fraction of the area to recombine. It
was measured before being built, by resizing the live overlay with `SetWindowPos` and holding the
render load constant:

| Overlay | Area | CPU (one core) |
|---|---|---|
| Full work area | 8.0 MP | 36.3% |
| 600x600 | 0.36 MP | 25.8% |

**A 22x area reduction bought 29% less CPU.** So the per-frame cost is almost all fixed overhead —
frame loop, canvas state, WebView2's commit and present — not per-pixel compositing. A window that
chases the slime would buy roughly ten points for a large amount of new complexity: repositioning
per frame, keeping the bubble and cursor inside the frame, and re-deriving screen-space coordinates
every time it moves. Not worth it, and this table is here so it does not get re-litigated.

Nor is it the dev build. A release build (LTO, no vite client, no source maps) measures the same
35-41% of a core while animating as `tauri dev` does, so the numbers above are not a dev artifact.
Idle in release is the same story as in dev: it stands down.

What that leaves is the fixed per-frame cost, which is why standing the loop down — not making each
frame cheaper — was the optimisation that actually mattered. The one lever left would be capping the
pet below 60 fps while it moves, which would roughly halve the animating cost and is deliberately
not taken: motion smoothness is the thing this app is actually judged on.

## Input rate, and what it is not

The drag is driven **only** by the DOM pointer stream. It used to be driven by that *and* the 30 Hz
cursor poll from Rust, so the poll kept overwriting the per-frame DOM position with a staler,
coarser one — which is what actually made dragging look like it was running at a low frame rate.
The render loop was a solid 60 fps at a 16.8 ms p95 throughout.

What the numbers actually are, measured during a real drag: about **127 raw mouse samples a second**,
which Chromium coalesces to **one `pointermove` per animation frame**. So position already updates
exactly once per rendered frame and cannot usefully update more often. Smoothing was tried here and
removed: with input already at frame rate it bought nothing and cost about two frames of lag on a
gesture whose whole job is to feel attached to the hand.

The coalesced samples are not wasted, though — `getCoalescedEvents()` hands them back, and they go
into the velocity fit, which wants every sample it can get.

Two further sources of per-frame noise were removed rather than measured away. The 30 Hz cursor poll
is silenced for the duration of a gesture: it exists so the slime can watch a pointer it cannot
receive events from, and during a drag it *is* receiving events at frame rate, so each emission was
an IPC delivery deserialised and dispatched on the same thread rendering the drag. That suppression
rides on the click lease (`hold_clicks(dragging)`) rather than being its own flag — it was briefly a
standalone latch set on pointerdown and cleared on pointerup, and a pointerup that never arrived
muted the poll forever, so the frontend's cursor went permanently null, so nothing was ever over the
slime, so every click passed through it. In this app, anything that can strand the frontend has to
expire on its own.
And the dirty region is now two rects rather than their union whenever they do not overlap — once
the slime moves faster than its own width per frame, the union is mostly the empty space between
where it was and where it is.

**A caveat on the 60 fps figure:** it is measured from `requestAnimationFrame` intervals, which
proves the frame loop is not hitching. It does not prove that a transparent, always-on-top, layered
window is actually being *presented* at 60 Hz — on Windows those are separate things, and the
presentation path for such a window is largely not ours to control.

## Throwing

Release velocity is a least-squares fit of position against time over the trailing 90 ms, in real
pixels per second.

The first version differenced the last two positions and multiplied by 12. Both halves were wrong:
the constant stood in for a timestep that is really about 8 ms, making every throw roughly ten times
too slow, and a single final sample is the worst possible one to trust, because people decelerate in
the last few milliseconds before letting go — so the delta collapses toward zero and the slime drops
instead of flying. Fitting a window is how every touch platform computes a fling.

A release after the hand had already come to rest returns zero: that is a drop, not a throw. On
release the deformation carries the release velocity forward, so the body leaves the hand still
stretched rather than snapping back to a circle.

The body does **not** leave with the hand's full speed. It takes 45% of it, capped at 1400 px/s, and
air drag bleeds that off over about a second. Handing over the raw fitted velocity was physically
literal and felt wrong — every flick launched the slime across the screen like a ping-pong ball,
when some of that momentum should be going into deforming it rather than moving it. Restitution is
0.34, so it lands and settles instead of ricocheting.

## The paw cursor

Over the pet, the OS cursor is hidden and a cat paw is drawn on the canvas instead: toes spread when
hovering, tucked in with the pad flattened when pressed, plus a ring that expands and fades at the
click point.

`cursor: pointer` would have been one line and has no latency, but an OS cursor cannot animate on
click, and something that visibly closes is what tells you the press registered.

This started as a realistic pointing hand, which did the job but read as clip-art next to a soft
round jelly. A paw keeps the "you can grab this" meaning — the thing a cursor is actually for — that
a purely abstract shape would have lost.

Hiding the real cursor is safe for the same reason the overlay is safe: `cursor: none` is applied
only while the overlay is accepting clicks, and it only accepts clicks while the frame loop is
actively renewing the lease. Stop the loop by any means and the lease lapses, the window goes
click-through, and the OS cursor is back. The pointer cannot be lost by a bug in the drawing code.

## The settings window

It is **declared in `tauri.conf.json` and created hidden at startup**, then shown and hidden. It is
not built on demand, and that is not a style preference.

Building it at runtime with `WebviewWindowBuilder` produced a window whose WebView2 never fetched
the document at all. Everything that could be checked said it should have worked: Tauri logged the
correct URL, `build()` returned no error, that URL served a complete page over curl, the window
appeared at the right size and position, its message loop acknowledged a delivered `WM_CLOSE`, and
there were no orphaned WebView2 processes holding the user-data folder. What gave it away was that
no vite client ever loaded the settings module — the page simply never arrived. The result was a
blank window that also could not be closed, because a close request had nothing behind it to tear
down.

Moving it onto the same startup path the pet window already uses fixed it on the first try. Closing
it therefore hides rather than destroys (`CloseRequested` is prevented), because a destroyed one
could only be recreated the way that does not work. Right-clicking the pet toggles it, so there is
always a way to dismiss it that does not depend on its own title bar.

The page also paints anything it throws into itself and echoes it to the console. A settings page
that fails silently is indistinguishable from one that never loaded, which is most of what made
this expensive to find.

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
- **Ctrl+Alt+Shift+Q** quits, from anywhere. This exists because every other way out goes through
  something this app can break: the tray icon, which Windows 11 hides in the overflow flyout by
  default so most people never find it, and clicking the pet, which stops working exactly when you
  most want to quit.

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

The lead time is nominally 5 minutes and in practice lands somewhere in the 5:00-6:00 window:
`num_minutes()` truncates, so 5m59s reads as 5 and already qualifies, and the poll cadence decides
which second inside that it actually fires. The window closes one minute after the start, so opening
the app just after a meeting begins still gets a reminder while opening it well into one does not.

Hops are spaced 1.5s apart. A hop is airborne for about 0.54s, so the original 0.85s spacing left
three tenths of a second on the ground — not a pulse but continuous bouncing, which reads as panic
rather than as a reminder. Landing and visibly resting between hops is what makes it a beat.

### Hovering acknowledges; it does not dismiss

Hopping stops as soon as the pointer is over the pet. Reaching for it is already the gesture
that says "I have seen this", so requiring a click to stop the flailing asked for a second
acknowledgement of something already acknowledged - and it meant the slime was still bouncing
around at the exact moment you were trying to aim at it.

Acknowledging is not dismissing, because the meeting has not happened yet. The reminder drops to
a `nudge` state: the same hue drained of urgency, eyes back to normal, no hopping, and one soft
pulse every 3.2s - enough to stay in peripheral vision without asking for anything. Clicking
still joins (or dismisses, for a meeting with no link), and it still clears itself three minutes
after the start.

This is also why a visible bubble no longer counts as "something is animating". A nudge can
stand for minutes showing the same words, and treating the bubble's presence as motion pinned
the render loop at full frame rate for all of it. The bubble now reports when it is *fading* and
when its text *changes* - a countdown ticking over once a minute - and only those force a
repaint.

### A broken calendar connection is visible

If the calendar cannot be read - the sign-in expired, the permission was revoked, Google is
unreachable - the reminders simply stop coming. That used to be entirely silent, so the first
sign of trouble would be a missed meeting.

The poller now reports the failure to the overlay, and hovering the pet says what is wrong
instead of naming the next meeting: "Calendar sign-in expired", "Calendar permission missing",
"Can't reach Google Calendar". On hover rather than announced, because this is a state to
discover when you look at the pet, not something to interrupt you with. A successful poll
clears it.

The message is a translation of the failure, not the failure itself: the raw text is a status
line with Google's JSON body attached, which is right for a log and useless on a pet's head.

**Tray → Test reminder** fires the whole performance immediately through the same `meeting-soon`
event the poller uses. Tuning the rhythm otherwise means creating a real calendar event and waiting
out the lead time for each adjustment, and going through the real path is what would have caught the
frontend listener going missing.

### Making it a one-click Connect

Google has no anonymous OAuth: every program that touches a Google API has to present a registered
client ID. Apps that "just connect" are not exempt from that — their developer registered one client,
once, and shipped it inside the binary, so each user only ever sees a button.

Slime can do the same. Build with the credentials in the environment and they are compiled in:

```bash
SLIME_GOOGLE_CLIENT_ID=…apps.googleusercontent.com SLIME_GOOGLE_CLIENT_SECRET=… npm run tauri build
```

On Windows, `scripts/build-with-google.ps1` does that for you: it asks for the two values once,
offers to save them to `scripts/google-client.json` (gitignored), and runs the build. It also forces
a rebuild of the app crate first — Rust caches on source hash, not on environment, so a build after
changing the credentials would otherwise reuse the old object and silently ship the wrong client.

Settings then shows a single Connect button — the walkthrough, both credential fields and the Save
button are hidden, because they are setup work that no longer exists. A credential pasted in Settings
still overrides the built-in one, so a build can be pointed at a different Cloud project without
rebuilding.

Shipping the secret in the binary is deliberate and is what Google intends for installed apps: a
desktop client secret is explicitly not confidential, which is the entire reason this flow uses PKCE.
The security rests on the per-attempt verifier, not on that value staying hidden.

The registration itself still has to happen once, by whoever builds it. What follows is how.

### Connecting your Google account

You need your own OAuth client — this app has no shared one, and a client ID baked into a
distributed binary would be a credential anyone could extract.

1. In the Google Cloud console, create or pick a project.
2. Enable the **Google Calendar API**.
2b. Under **Data Access**, add the scope `calendar.events.readonly`. A scope the app has not
   declared may not be offered on the consent screen, and the resulting sign-in succeeds while
   being unable to read anything.
3. On the OAuth consent screen, add your own account as a **test user**. The calendar scope is a
   sensitive one, so an app in testing mode only works for listed users.
4. Under Credentials, create an **OAuth client ID** of type **Desktop app**. There is no redirect
   URI to fill in: desktop clients are allowed to use loopback, which is what Slime listens on.
5. Paste the client ID and secret into Slime's settings, then press Connect.

**Avoiding the 7-day expiry is the awkward part, and not for the reason you would guess.** Google
revokes refresh tokens after 7 days for an External app whose publishing status is still Testing,
so it logs itself out every week. But publishing is not simply a button:

- **Publishing** an External app to production requires a homepage URL, a privacy policy URL and
  a terms-of-service URL on the Branding page, plus the matching authorized domain. Google's own
  wording: "These links are required for all external production apps." Until they are there the
  Publish button is greyed out, with only a pointer back to the Branding page to explain why.
- **Verification** is the separate, heavier step that additionally wants the domain *verified* in
  Search Console and reviews what the app does. Its only effects are removing the one-time
  "unverified app" screen and lifting a 100-user lifetime cap - neither of which matters for a
  pet on your own desk.

Three ways out, in order of preference:

1. **Make it Internal.** An Internal app is exempt from the 7-day expiry, the 100-user cap and
   verification, and needs none of those URLs. It requires the Cloud project to live in a
   Workspace organisation, so it is only available if you have one.
2. **Host the pages in `docs/`.** Google wants three URLs, not two: a homepage, a privacy
   policy *and* terms of service, all on one domain that is listed under Authorized domains.
   `docs/` contains all three, written to match what this app actually does. Serve that
   directory with GitHub Pages (Settings > Pages > main branch, /docs) and fill the URLs in.
   Publish then unblocks permanently.
3. **Stay in Testing and reconnect weekly.** Nothing to set up. The app detects this case
   specifically and names it, rather than failing silently.

A personal Google account is otherwise sufficient throughout, at no cost and with no billing
enabled. The only thing it genuinely cannot do is choose the Internal audience above.

The authorisation request asks for `prompt=select_account consent`, so the account chooser
always appears. Without `select_account`, Google silently authorises whichever account the
browser happens to be defaulted to - and if that is a Workspace account whose organisation
blocks unreviewed third-party apps, the flow dies on "your institution's admin needs to review
Slime" with Error 400 access_not_configured, which says nothing about the real problem being
that an account was picked for you.

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

## Eating a window

Hold the slime still over a window and it engulfs and swallows it. That is another way to close
things, and the only one that still works once an app has stopped responding.

Closing escalates in three stages, and the escalation is the animation rather than something hidden
behind it:

1. `PostMessageW(WM_CLOSE)` — the polite knock, exactly what the X button sends.
2. Wait, polling `IsWindow` at 10 Hz for 2.5 seconds.
3. `TerminateProcess`, and only if `IsHungAppWindow` says the app is not pumping messages.

**That last gate is the whole safety argument.** The obvious implementation escalates on "the window
is still there after n seconds", which kills an editor that is showing a *save changes?* prompt — a
window is still there precisely because the app answered the knock and is waiting for you. So a
responsive window that stays is `Resisting`, which is a stop, not a stage. Only a hung one is
eligible to be killed.

The force stage is also not reached on its own: `swallow` returns `Hung` and hands the decision back,
and `force` is a separate call. `WM_CLOSE` is refusable, promptable and undoable; `TerminateProcess`
is none of those, so it does not ride along on the gesture that began a polite close.

An elevated process cannot be opened by this one, which is not worth fixing — a desk pet that can
kill anything on the machine is a worse trade than one that visibly cannot chew through an admin
window. That comes back as `TooTough`.

### Finding the window under the slime

`WindowFromPoint` is unusable here. It skips `WS_EX_TRANSPARENT` windows, which sounds like exactly
what is wanted — except the overlay holds a click lease for the whole duration of a drag, so at the
moment this runs it is *not* transparent and matches itself at every point on the screen.

So `EnumWindows` walks top-level windows front to back and takes the first whose rect contains the
point, skipping the invisible, the minimized, the untitled, the shell's own furniture, and anything
DWM reports as **cloaked** — Windows 11 keeps windows on other virtual desktops alive and hidden, and
`IsWindowVisible` says true for every one of them.

**The self-exclusion is load-bearing, not defensive.** A probe of the whole screen with it removed
returns exactly one window: the overlay, at 0,0, covering the entire work area. It is an ordinary
visible, titled, uncloaked window and nothing else in the filter list excludes it. If the pid check
ever stops matching, the only window the slime can reach is itself.

### Two coordinate traps, both silent

`GetWindowRect` includes the invisible DWM resize border — about eight pixels past the visible frame
on three sides, so a maximized window reports as starting at x = -9. Hit-testing against that makes
a strip of empty space either side of a window count as being over it, and the body would wrap
around a box visibly larger than the thing it is swallowing. `DWMWA_EXTENDED_FRAME_BOUNDS` is the
rect the window actually looks like it occupies.

`GetWindowRect` also does not answer in physical pixels unconditionally: it answers in whatever
space the calling process is DPI-virtualized into. DWM always answers in physical pixels, as does
Tauri's `cursor_position` and the overlay's own placement, so the app is consistent — but a
DPI-unaware process reading the same window gets it back divided by the display scale. On the 150%
display this was developed against that is a 1.5x error with no failure anywhere: the test harness
has no manifest, so it reported a 3840x2160 screen as 2560x1440 and a probe grid sized to the
numbers it believed covered a quarter of the screen. Both the harness and the rect source are now
pinned to physical pixels.

### Trying it

**Tray → Test devour (3s, at cursor)** waits three seconds, then targets whatever is under the
pointer and runs the polite close, printing the target and the outcome. The delay exists because by
the time a menu event arrives the menu has closed and the pointer is still down by the tray, so
sampling immediately would only ever test whatever sits in the bottom corner of the screen.

The force kill is deliberately not reachable from the tray. It is the irreversible half, and it
belongs to a gesture the user is still holding, not to a menu item that can be clicked by accident.

`cargo test -- --nocapture list_eatable_windows` prints every window the hunt is willing to eat.
There is nothing to assert against a live desktop — what it is read for is the taskbar, the desktop
or another virtual desktop's windows turning up, each of which is a filter above having failed.

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
- Eating a window has its backend and its gesture-free test path, but no gesture and no animation
  yet: no hold-still trigger, no engulf, no burp. `IsHungAppWindow` and the force kill have not been
  exercised against an actually hung app.
- Multi-monitor: the overlay is pinned to the primary monitor only.
- No autostart-on-login registration.
- No sound.
- The slime does not know about window edges, so it walks along the bottom of the screen rather than
  sitting on top of your windows.
