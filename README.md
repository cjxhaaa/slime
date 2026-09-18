# Slime

A desk pet that lives on top of your screen. It eats windows you want rid of.

Everything you see is simulated, not animated: there are no sprites, no frames and no art assets in
this repo. The body is a soft-body physics ring and the face is drawn from primitives, which is
exactly why a slime was the right character — squash and stretch *is* the animation language, so a
blob gets expressive behaviour out of physics that a cat would need a rigged skeleton and an artist
to match.

## What it actually does for you

One job so far, shaped by a constraint that applies to anything else this ever grows: **a desk pet
has almost no bandwidth.** All it can say is a colour, a rhythm, a shape and a line of text you have
to hover for. So nothing here is allowed to be a notification with a face on it — the pet is only
worth having if you can read it out of the corner of your eye and ignore it the rest of the time.

### It closes windows, including ones that have stopped responding

Hold the slime still over a window for two seconds and it latches on, wraps itself over the window
across three seconds, and swallows it. **The window closes when the animation finishes** — the
commitment is all on screen, so pulling the slime off it at any point calls the meal off.

It is worth having over the X button in three situations:

- **The app is hung.** Clicking X on a frozen window does nothing at all. The slime escalates to
  killing the process — but only when Windows itself reports the app as not responding, and only if
  you click a second time to say so. An app showing a *save changes?* prompt is answering, not
  frozen, and never gets killed.
- **The window is buried.** The slime only needs one visible sliver to land on, so it hauls the
  window to the front first, then eats it. Measured on an ordinary desktop, three of four open
  windows were 33%, 65% and 92% hidden behind something else.
- **You do not want to aim.** The X is a small target in a corner that moves with every window. The
  pet is wherever you last put it.

This is the one feature that is Windows-only — reaching into another application's windows is the
least portable thing here. See [Platforms](#platforms).

### And the rest of the time it stays out of the way

Clicks pass straight through it to whatever is underneath, so it can sit anywhere on the screen
without being in the way of anything. It idles at about 4% of a core, falls asleep after 95 seconds
of being left alone, and mostly decides to do nothing — a pet that fidgets constantly is exhausting
to have on screen. Drag it, throw it, poke it; **Ctrl+Alt+Shift+Q** quits from anywhere.

## Stack

Tauri 2 + TypeScript, Canvas 2D, Rust backend.

Tauri over Electron because this thing runs all day: it uses the system WebView2 that Windows
already ships, so it idles at roughly a third of what an Electron build of the same app would.
Everything a desk pet needs — a transparent always-on-top window, click-through, a tray icon — is
native to it, and the Rust side is where reaching into another application's windows belongs
anyway.

Using the system webview means the renderer is not the same engine everywhere: WebView2 on Windows,
WKWebView on macOS, WebKitGTK on Linux. That mostly does not matter for Canvas 2D, but the repaint
tuning below was measured against DWM compositing a layered window, and nothing says those numbers
carry.

## Running it

```bash
npm install
npm run tauri dev
```

To build an installer to actually give someone:

```bash
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/nsis/`; on macOS and Linux the `.dmg`,
`.deb` and `.AppImage` land beside it. Nothing is
signed, so Windows SmartScreen shows "unknown publisher" on first run — More info -> Run anyway —
and macOS Gatekeeper refuses an unsigned `.app` outright until it is opened once from the context
menu, or cleared with `xattr -dr com.apple.quarantine`. Signing either away needs a paid certificate
(and on macOS an Apple Developer membership), which has not been worth it for two users.

## Platforms

Windows is what this was built on and the only place it has been run. The macOS and Linux targets
build-configure cleanly and the dependency graph resolves for both — `cargo tree` picks up Keychain
on macOS and Secret Service on Linux — but neither has been **compiled or run**. Treat them as
untested rather than supported.

|                                   | Windows            | macOS      | Linux / X11    | Linux / Wayland |
| --------------------------------- | ------------------ | ---------- | -------------- | --------------- |
| Transparent always-on-top overlay  | yes                | yes        | yes            | **no**          |
| Click-through                      | yes                | yes        | yes            | n/a             |
| Cursor tracking                    | yes                | yes        | yes            | **no**          |
| Tray icon                          | yes                | yes        | usually        | usually         |
| Credential store                   | Credential Manager | Keychain   | Secret Service | Secret Service  |
| Eating a window                    | yes                | **no**     | **no**         | never           |

### Wayland is not a target

Two of the three things the overlay is made of are unavailable to a Wayland client by design rather
than by omission. A client cannot position its own window in screen coordinates or ask to stay on
top — that needs `wlr-layer-shell`, which tao does not expose and GNOME does not implement — and it
cannot read the global pointer position at all. Eyes that follow your cursor and "which window is
under the slime" both hang off the second one.

Run it in an X11 session. There is no partial Wayland mode worth shipping, and no amount of work
inside this repo changes that.

### Eating a window is Windows-only

The feature is behind a platform backend (`src-tauri/src/devour/`). Windows is implemented; macOS
and Linux get a stub that reports no prey, which makes the feature *absent* rather than broken —
`window_at` returning nothing is a state the frontend already hits every time the slime is over bare
desktop. The frontend asks `devour_supported` once at startup and stops probing.

`devour/unsupported.rs` carries the map for implementing the real backends: X11 has a designed
equivalent for nearly all of it via EWMH, including `_NET_WM_PING` for the hung check that gates the
force kill. macOS does not — it has no public "is this app hung" call, and reading window titles
needs Screen Recording consent while closing a window needs Accessibility consent. **Do not ship the
force stage on macOS until that gate is rebuilt**; it is the only thing standing between this
feature and killing an editor with an unsaved-work dialog open.

### Linux build prerequisites

On top of the usual Tauri set (`libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`,
`libgtk-3-dev`, `librsvg2-dev`), one more earns its place here:

- `libayatana-appindicator3-dev` — the tray. A stock GNOME session does not show one without an
  extension, so tray creation is treated as best-effort: it is logged and skipped rather than
  aborting startup, and `Ctrl+Alt+Shift+Q` is the exit that does not depend on it.

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

### The dirty rect is measured off the outline, not estimated from it

`bounds()` used to estimate the body's reach from the ring's rest radii and pad the result. The
outline is not built from those radii alone: `draw` applied a directional stretch on top, up to half
a body-length along the direction of travel, and nothing outside `draw` knew about it.

A resting slime hid that completely. The rect has a floor of about two body-widths to cover the
sleep marks, and that floor swallowed a stretch measured in tens of pixels. A body still wrapped
around a window does not have that slack — the measured term is then the larger one — so dragging
the slime off a window mid-engulf painted **95 px of outline outside the region that had been
cleared**, every frame of the drag, which is exactly the smear it left behind.

So the outline is now traced once per frame in `beginFrame`, which already existed as the step whose
contract is that `bounds()` and `draw()` must describe the same frame, and `bounds()` measures the
array that is about to be drawn. `Blob.maxReach` is gone rather than fixed: any estimate of what
`outline()` returns has to be kept in step with it by hand, and this one silently was not.

Measuring per axis rather than as a radius also stopped the rect being a square built from a
window's half-diagonal, which cut the area cleared during an engulf by about a fifth.

### A repaint request that could not request a repaint

`fullRepaint` is read twice: once to widen the damaged region to the whole canvas, and once as part
of deciding whether to paint at all. It was being cleared between those two reads, so the second
one was always false. Anything that asked for a repaint *without* also setting the slime in motion
got the full-screen clip and then no paint inside it.

Nothing noticed for a long time because almost everything that wants a repaint is already moving.
Resizing the window while the pet sat still left the canvas blank until it happened to twitch, and
that is rare enough to read as a compositor hiccup. It surfaced properly when the body started
changing colour on a ten second timer: a slime that had been asleep for an hour simply kept its old
realm's colour until something nudged it.

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
dragged. Colour is reserved for state — amber means something wants you — because that is the one
thing that has to read instantly from the corner of your eye.

**Two of those states are derived from the realm rather than fixed, and one of them had to be
fixed twice.** Eating a window used to substitute a hard-coded teal, and teal is the 练气 family, so
a 金丹 pet turning to eat something reverted to the colour it had on day one. The intent behind that
constant was "deeper and more saturated than calm" — which is a *relationship*, not a colour, and a
relationship has to be computed. It steps each stop one place down its own palette now: core halfway
to edge, edge most of the way to rim, rim unchanged. That needs no colour maths and cannot go muddy,
because every value it can produce is one already chosen for that realm.

**Sleep is reached by a fade, not by a substitution.** It used to cut straight to the sleeping
colour on the frame the mood changed, which is the one transition in the app where a cut is wrong:
everything else the pet does is an event, and dozing off is a drift. Just over a second on the way
in, under half of that on the way back, because waking is a start rather than a drift — a pet that
took a leisurely second to notice a poke reads as unresponsive rather than as sleepy.

Sleep is also no longer a branch in the palette selection; it is a blend laid over whatever the
answer would otherwise have been. Which means an alert firing on a sleeping pet slides from blue to
amber instead of cutting, and that came for free.

Two things this needed that a cut did not. The body's gradient is cached by colour, and a fade
produces a new colour every frame — so caching through a transition would add a gradient per frame,
forever, for every time the pet ever dozed off; mid-fade it builds one per frame instead and only
consults the cache at the endpoints, which is why the easing has to hit its endpoints exactly rather
than merely approach them. And a fade is the only thing here that changes the screen without moving
anything, so the renderer has to be told about it explicitly — otherwise hovering a sleeping slime
awake and then leaving it alone would freeze the body half blue until something else happened to
trigger a repaint.

The blend runs in RGB, which for gold and blue passes through a desaturated middle. That is the
right path: the two are near enough to complementary that interpolating in HSL instead would sweep
the hue through green or magenta, and a rainbow is far more distracting than the colour briefly
draining out.

A dimmed-but-in-hue palette per realm was also built, so that a sleeping pet still showed which
realm it had reached — it needed HSL to keep 金丹 from turning khaki, it worked, and it was rejected
on looks. Nine dim colours were more of a palette than the pet wanted.

The idle scheduler mostly decides to do nothing. That is deliberate — a pet that fidgets constantly
is exhausting to have on screen, so stillness is the common case and movement is the exception. It
falls asleep after about 95 seconds of being left alone, and wakes when poked or when something
raises an alert.

- **Drag** it to move it. Release with speed to throw it; it bounces off the walls and floor.
- **Click** it to poke it, or to answer the alert while it is bouncing.
- **Right-click** it to open settings.
- **Ctrl+Alt+Shift+Q** quits, from anywhere. This exists because every other way out goes through
  something this app can break: the tray icon, which Windows 11 hides in the overflow flyout by
  default so most people never find it, and clicking the pet, which stops working exactly when you
  most want to quit.

A press is a poke if it was under 260 ms and moved less than 6 px; anything else is a throw.

## Eating a window

Hold the slime still over a window for two seconds and it latches on, spends three seconds
engulfing it, and swallows it. That is another way to close things, and the only one that still
works once an app has stopped responding.

### Letting go is not calling it off

Releasing the button does **not** abort. Once the slime has committed it finishes the meal on its
own, and the way to stop it is to take hold of it and pull it off the window — the same gesture as
picking it up.

That split is the safety design, and it is the opposite way round from the obvious one. A
dead-man's switch — keep holding or it stops — makes the *safe* action "stay perfectly still",
which is the opposite of what anyone does when something unexpected starts happening on screen.
Here the instinct, grab the thing, is the abort.

What makes that safe enough to trigger by merely holding still is that none of the commitment is
invisible. The three seconds are spent on screen: the membrane visibly creeps out over the window
for all of them, and the window is closed only when that animation completes. There is no timer
running behind a still image.

The abort is a *pull*, not a click, so a press on a slime mid-meal waits to see whether it travels
eight pixels before it counts. That leaves the plain click free to mean something else, which is
what the force kill needs.

### The stages are the animation

1. The engulf, three seconds, abortable throughout.
2. `WM_CLOSE`, then a 2.5 s wait polling `IsWindow` at 10 Hz. A normal app goes in well under a
   frame, so the window simply vanishes as the body closes over it.
3. If it is still there, it is one of two things, and they are not the same thing.

**That last distinction is the whole safety argument of the backend.** The obvious implementation
escalates to a kill on "the window is still there after n seconds", which kills an editor showing a
*save changes?* prompt — a window is still there precisely because the app heard the knock and is
waiting for you. So a responsive window that stays is `Resisting`, which is a stop: the slime spits
it back out and says it is asking you something. Only `IsHungAppWindow` — the signal the shell uses
to write "(Not Responding)" on a title bar — makes a window eligible to be killed.

And even then the kill is not automatic. A hung window leaves the slime wrapped around it and
chewing, and the force happens on a *click*, which is a second deliberate act. `WM_CLOSE` is
refusable, promptable and undoable; `TerminateProcess` is none of those, so it does not ride along
on the gesture that started a polite close. `force` re-checks `IsHungAppWindow` itself rather than
trusting the frontend, because three seconds of animation is long enough for an app to have
recovered and put a dialog up in the meantime.

An elevated process cannot be opened by this one, which is not worth fixing — a desk pet that can
kill anything on the machine is a worse trade than one that visibly cannot chew through an admin
window. That comes back as `TooTough`.

### Two things the wrapped body must not do

**Claim clicks across the whole window.** The click lease is granted from `hitTest`, so a slime
wrapped around a maximized window would take every click inside it for as long as the meal lasts —
which is exactly the failure the lease exists to make impossible. `hitTest` therefore keeps
measuring against the resting body radius even while the body is the size of a window, so the
handle stays a body-sized patch in the middle of the meal. The face is drawn there, so the place to
grab is the place that looks like the slime.

**Outlive its own dirty rect.** The bounds are computed from the ring's present reach rather than
from the devour state, because the two do not end together: letting go clears the state at once
while the body takes another 0.45 s to shrink back. Keying the bounds off the state left the
unwinding body drawing outside its own dirty rect, and the clip cut a visible notch out of it. In
every ordinary case the resting term is still the larger of the two, so this costs nothing when
nothing is being eaten.

Engulfing a maximized window does mean repainting most of an eight-megapixel transparent layer for
three seconds, which is the cost the whole stand-down design exists to avoid. It is accepted here:
it is bounded, it is rare, and it happens only because the user asked for it.

The three seconds are simulation time, not wall time, and the simulation is deliberately allowed to
fall behind during a stall rather than catching up at several times speed. A throttled overlay
therefore takes *longer* than three seconds to eat something — which is fine, because the animation
and the deadline are the same clock. The close still fires exactly when the body finishes closing.

Closing escalates in three stages, and the escalation is the animation rather than something hidden
behind it:

1. `PostMessageW(WM_CLOSE)` — the polite knock, exactly what the X button sends.
2. Wait, polling at 10 Hz for up to 2.5 seconds.
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

### "Gone" is a question about pixels, not about handles

The wait polls whether the user can still *see* the window, not whether the handle exists.
`IsWindow` is the obvious test and it is wrong in the direction that shows: a Chromium or Electron
app hides its window the instant it accepts `WM_CLOSE`, then spends seconds tearing down renderer
processes with the handle still perfectly valid. Waiting on the handle left the slime swollen
around a window that had visibly gone, shrinking back only once the process finally exited — and an
app that closes to a tray icon never releases the handle at all, so that one ran out the full grace
period and then reported `Resisting`, meaning the pet pulled the wrong face at the end of it too.

So the loop asks `IsWindowVisible && !IsIconic && !cloaked`, which is the same "can the user see
this" predicate that decides what is eatable in the first place.

One ordering constraint comes with that, and it is not optional: **`IsHungAppWindow` is checked
before the visibility test.** The shell hides a window it has decided is hung and puts a
"(Not Responding)" ghost in its place. Read in the other order, the single case this whole feature
exists for looks like a clean meal, and the force kill — the only thing that could deal with it —
is never offered. For the same reason `force` itself tests `IsWindow`, not visibility.

Both branches now answer as soon as the answer is known rather than at the deadline.
`IsHungAppWindow` is already debounced by about five seconds, so it will not trip on an app that is
merely busy, and sitting out the rest of the grace period only delays telling the user something
that is already true.

### Hauling a buried window out first

The slime only needs one visible sliver to land on, so the window it targets can be almost entirely
behind other windows — measured on a real desktop, the four eatable windows were 0%, 33%, 65% and
92% buried. Swallowing the last of those would look like the pet eating nothing.

So the hunt reports occlusion along with the window: the z-order is walked front to back, stopping
at the target, and the windows genuinely in front of it are rasterized into a 64x40 grid over its
rect. A grid rather than an exact rectangle union, because the union area of n overlapping rectangles
is real work and 2560 cells answers "is a meaningful part of this hidden" to well under a percent.

Above 6% the slime spends a second visibly hauling before it starts eating, and the window comes to
the front as the strain peaks. Not zero, because a window overlapped by a sliver is one you can
plainly see being eaten and heaving for it would put a second of animation in front of every meal.

`SetForegroundWindow` is the obvious call to raise it and the wrong one twice over: Windows refuses
it to a process that does not already own the foreground, and stealing focus is not what is wanted
anyway — the window needs to be *visible*, not active. `SetWindowPos(HWND_TOP, SWP_NOACTIVATE)` is a
z-order change and is not subject to the foreground lock. The occlusion is then measured again
rather than assumed, because the call can be refused and a window pinned under a topmost one stays
buried even when it succeeds; if it is still buried the pet says so instead of pretending.

The self-exclusion in that measurement is load-bearing for the same reason it is in the hunt, and it
bites harder: the overlay is always-on-top and covers the whole work area, so counting it reports
**every window on the desktop as 100% buried**. That is what the smoke test printed the moment a
copy of the app was running alongside it.

### Wrapping from where it landed, not from the middle

The body used to slide to the centre of the window before wrapping it. That put the face somewhere
the user had not pointed at, made every meal look the same regardless of where it started, and on a
maximized window the slide was most of the animation. It now grows from wherever it was sitting, so
the four distances to the window's edges are measured from the body rather than passed as
half-extents — from near a corner the far edge can be twenty times further away than the near one,
and that asymmetry is most of what makes a wrap read as *this* window.

### Why the wrap wobbles

Moving the ring's rest radii on a single eased clock is what made the engulf read as a rectangle
being scaled. Three things fix it, and all three are physics rather than keyframes:

- **Staggered arrival.** Points with less ground to cover finish early and the furthest corner lands
  last, so the shape spreads from the near edge like something being poured. Everything still
  completes on time, because that duration is a promise: it is the window in which pulling the slime
  off still calls the meal off.
- **Membrane lag.** The surface is dragged behind the shape it is being pulled onto by injecting
  into the ring's own velocity, so the existing springs and neighbour coupling carry it around the
  ring as a wave instead of it being a decorative wobble laid on top.
- **A slap on arrival.** Without it the wrap ends dead still: a smoothstep ramp brings its own
  velocity to zero, so a surface driven only by the lag is gently set down and rings not at all.
  Each point is kicked outward the instant it reaches its edge.

Both are bounded as a fraction of the local radius rather than in pixels, because one ring spans
both ends of that scale at once — wrapped from near a corner, the near edge is sixty pixels away and
the far one seventeen hundred. A pixel budget generous enough to show on the far side turns the near
side inside out; one safe for the near side is invisible on the far.

The ring's standing damping had to be relaxed while it settles, too. It is tuned for a small blob
taking a poke, where a lingering wobble would read as instability, and at that setting the arrival
wobble was gone inside a third of a second — under one full oscillation, so it landed as a single
bounce. Held loose, the same slap rings three or four times over about a second. Measured on a
1600x900 window: sag peaks at 10% of the local radius, and the wobble decays 92 → 76 → 56 → 37 → 22
→ 8 → 0 px over 0.95s. The relief lapses on its own, so nothing else the slime does inherits it.

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
pointer and runs the polite close with no animation, printing the target and the outcome. The delay
exists because by the time a menu event arrives the menu has closed and the pointer is still down by
the tray, so sampling immediately would only ever test whatever sits in the bottom corner of the
screen.

The force kill is deliberately not reachable from the tray. It is the irreversible half, and it
belongs to a gesture the user is still holding, not to a menu item that can be clicked by accident.

`__simulateDevour(x, y, width, height)` in a devtools console engulfs a rectangle with no real
window under it. The real path runs through Win32 calls that only exist inside Tauri, and the
overlay can only be *seen* in an ordinary browser, so without this the animation is untunable for
the same reason `__raiseAlert` exists. The swallow then fails and is handled, which exercises
the unwind as well.

Note that the browser pane used for this drives no `requestAnimationFrame` of its own — the only
frames that run are the ones a screenshot triggers — so timings measured there mean nothing and the
simulation has to be stepped by hand to see anything move.

`cargo test -- --nocapture list_eatable_windows` prints every window the hunt is willing to eat.
There is nothing to assert against a live desktop — what it is read for is the taskbar, the desktop
or another virtual desktop's windows turning up, each of which is a filter above having failed.

## Cultivating

Left alone the slime accumulates qi, and when a stage fills it swells and hops until you click it.
[CULTIVATION.md](CULTIVATION.md) has the whole design and the arguments behind it, including the
four places the design was reversed while it was being written.

The realm is on the body, which is the whole reason for building this on a desk pet rather than in
a window: 青 → 碧 → 金 → 橙 → 赤 → 紫 → 靛 → 玄, about six percent larger each time, and a halo
that comes up over the last half of a stage so that "something is about to happen" is readable
across the room. The ramp is deliberately back-loaded — the pacing spends five of the eight realms
inside the first day, so the three that are left have to carry four days between them. Teal to
green is a shade; purple to near-black is an event.

### It eats what you type

The keys arrive as **paper charms** — a narrow slip of talisman paper with the letter in cinnabar,
ringed in whatever colour the pet's realm is currently wearing. They tumble in the air and settle
upright, riding a slow current rather than lying on the floor. The first pass drew a white rounded
square with the letter in a monospace face, which is precisely what it looked like: a key that had
fallen off a keyboard, in a game about condensing your work into something.

The colours do two jobs at once on an unknown desktop: warm paper stands off a dark wallpaper, and
the halo stands off a pale one.

**Every key knocks a speck of dust loose**, and it drifts back into the body and goes in with a
small dent where it landed. About once every five seconds one of them is a whole key instead — a
real letter, thrown far enough that the pet has to walk over and swallow it properly.

That is where the difference between working and being away lives: the floor is 35% of the full
rate and applies to being asleep, at lunch and switched off alike, and the dust makes up the rest.
Typing at an ordinary five keys a second comes to exactly the full rate, and typing at half that
lands halfway between. One rule instead of an offline system, an idle system and a cap — and no
offline-earnings screen, because there is nothing left for one to announce.

### Two tiers, because one number cannot do two jobs

The first attempt had a single throttle doing both jobs: how dense the stream looks, *and* how much
of your keyboard reaches the screen. Those pull in opposite directions — fast enough to feel like
the pet is eating your work is also fast enough to spell out a password — so every value was a
compromise, and the one that was safe felt like nothing was happening.

Splitting it fixes both. **Dust carries no letter, so there can be one for every key**: a nameless
speck says "you typed" and nothing else. Letters ride only on the rare keycaps.

The general version, which cost a rewrite to learn: when one constant turns up in two unrelated
justifications, it is probably two constants.

### Which means reading the keyboard, so: about four percent of it, out of order

Getting a real keystroke across applications means Raw Input with `RIDEV_INPUTSINK`, on a
message-only window of our own. That is a keylogger-shaped API and an antivirus may say so; it is
an accepted cost rather than a surprise, and it is the same one Bongo Cat pays.

What is *not* accepted is a password drifting across a shared screen one letter at a time. The
defence is arithmetic rather than good intentions, and **it lives in Rust rather than in the
frontend**: the backend will not hand over a letter more than once every five and a half seconds
however often it is asked, so a timer changed on the other side of the IPC boundary cannot turn
this into a keylogger. Against typing at about five keys a second that is **roughly four percent
of what you type**, drawn at random from a buffer that is then cleared. A password typed in two
seconds contributes zero or one character, unlabelled, out of sequence, in a day of other letters.
Punctuation never enters the pool at all: it is the most identifying part of a password, and an
exclamation mark says more than a `K` does.

Nothing is written down. A key is used to choose a glyph and dropped; the buffer holds a few
seconds at most and is emptied on every read.

### Seclusion is the master switch

The checkbox in Settings does not filter anything. It hands the registration back with
`RIDEV_REMOVE`, and Windows stops delivering keystrokes to this process. "I would rather it did not
watch me type" deserves an answer that is true at the system level rather than one this code
promises to honour.

It also stops the pet asking for anything: no glyphs, and a full stage waits quietly instead of
hopping. Clicking a pet that is ready still takes the breakthrough, so progress is never stuck
behind a trip to Settings.

What is not built yet is the daily window quota, and everything in section twelve of the plan.

### Eating a window is the fight

There is no combat system and there is not going to be one — an opponent, a health bar and a damage
readout are all panels, and a desk pet that needs a panel has stopped being a desk pet. But the
question "what are the numbers *for*" deserved a better answer than "the slime is a different
colour now", and it turned out the answer was already in the repo.

Swallowing a window was always shaped like a fight. It latches on. The application resists — that
is what `Resisting` means, it is asking you something. A frozen one escalates and needs a second
click to say so. An elevated one cannot be taken at all. Pulling the pet off mid-way calls the whole
thing off. What it lacked was stakes that moved: every window was the same amount of work, so the
realm you had climbed to changed nothing about it.

Now the window's share of the work area is how big an opponent it is, a hung one counts for 1.6× of
it, and how hard that lands depends on the realm:

| | small dialog | half the screen | maximised and frozen |
|---|---|---|---|
| 练气 | 3.0s | 7.0s, trembling | 8.0s, trembling |
| 金丹 | 3.0s | 4.2s | 8.0s, trembling |
| 化神 | 3.0s | 3.0s | 5.5s |
| 大乘 | 3.0s | 3.0s | **3.0s, barely a shudder** |

**Three seconds is a floor, not a starting point.** That interval is the entire safety margin of
the feature — it is the window in which pulling the pet off aborts, and the commitment is spent on
screen rather than behind a confirmation dialog. A stronger pet swallowing faster would be buying a
flourish with the only chance anyone gets to change their mind, so progress is spent at the other
end instead: a junior pet against a large window takes longer and visibly works for it. An assertion
covers every realm against every size and fails if any combination comes out under three seconds.

**The realm never decides whether you can.** Someone installed this to close an application that
has stopped responding. Discovering that the pet is too junior to try would be a product mistake
wearing difficulty as a costume. Effort and spoils scale; capability does not.

### The spoils, and why there is an allowance

A kill is worth a stretch of doubled output — twenty minutes plus thirty more scaled by how big the
opponent was, so a frozen maximised window is worth about an hour and a small dialog about twenty
minutes. The pet is visibly fuller and brighter for the duration, because a reward you cannot see is
not one; that argument is the same one that made the reward a *state* rather than a lump of qi.

The allowance — one nourished kill a day at 练气, rising to eight, banking up to three days — is
what keeps this a bonus instead of the fastest route up the ladder. Without a cap the quickest way
to progress would be to spend an afternoon closing things, and software that trains people to close
windows they still need is not a difficulty curve.

Past the allowance the window still closes and the pet still eats it. The cap is on the spoils,
never on the capability, for the same reason as above.

Two things about nourishment that are easy to get subtly wrong, and both are asserted:

- **Two kills are twice as long, not four times as fast.** Stacking the multiplier would make a
  burst of window-closing the fastest progression there is.
- **A settle that spans the end of nourishment has to be integrated in two pieces.** Credit the
  whole gap at the doubled rate and being away from the desk pays better than having been there,
  which is exactly backwards. The assertion that catches it is the same shape as the one for the
  bottleneck: one long settle and sixty short ones over the same stretch must agree.

### A breakthrough is something going away and something else coming out

Eight times in a run the realm changes, and the first two attempts at showing it both failed the
same way. The first one reused the stage animation: the pet looked pleased and the palette swapped
between two frames. The second added a column of light and slid the new colour up the body. Neither
one read as becoming something else, because in both of them **the body was on screen the whole
time** — you were watching a thing get repainted, not a thing turn into another thing.

So now it goes away. Three beats:

| | | |
|---|---|---|
| **Drawn in** | 2.0s | An array lights under the pet, eight charms wheel out, dust arrives from much further out than typing ever throws it, and a crust of jade hardens over the body and cracks |
| **Taken** | 0.55s | A lotus bud of qi rises off the array and swallows it whole |
| **Revealed** | 1.35s | The crust bursts, a figure surfaces inside the cage, and the cage thins out around it |

Just under four seconds, up from 2.3. At the shorter length it was over before it had been read —
the dust arrived, the light went up, the new form was standing there, and what you took away was
that something had flashed. There are eight of these in a run; they can afford the time. It does now
run marginally longer than the ascension, which the plan said it must not out-do, and that rule is
still intact — it is just no longer carried by the clock. The ascension is the only thing in the app
that leaves something permanent behind.

**The frame you click on has to be the first beat.** `clearAlert` leaves a pleased face behind,
which is the right reply to answering a full stage and the wrong one to being hauled into a column
of light — so the whole two-second gather played with the pet smiling, and that was the first thing
anyone noticed. It holds a braced face now, reasserted every frame rather than set once, so that
being picked up and put down mid-sequence cannot leave the dragged face on for the rest of it. The
ascension had the identical defect: 1.7 seconds of smiling through the ordeal.

**A longer beat cannot be fed by one burst at the start.** The original single handful of dust had
all arrived by the first third, leaving most of the gather empty. It is a wave every 0.13s now,
thickening as it goes, with about seventy specks in the air at the peak. The beats live in `Slime`
and the particles live in `main`, so the two meet at `takeDustRequest()` — the same hand-off shape
as the look request.

And the dust is drawn as **streaks rather than dots**. Seventy specks converging from across a
desktop are a scattering of pinpricks with no direction in them: the pull was in the physics and
nowhere on screen. The tail comes off each mote's **velocity** rather than off where it was last
frame — the remembered position looks like the obvious way to do it and is a frame-rate bug, since
the streak would be three times as long on the 20 Hz tier the loop drops to.

The spread came down from 3.2 body radii to 2.2 at the same time. At 3.2 the cloud started five
hundred pixels out, and seventy specks over that much desktop is a light dusting of the whole screen
rather than something arriving at the pet.

Whatever is doing the hiding is drawn **in front of** the body rather than behind it. That is the
entire mechanism: the old form is hidden, the new size and colour are put on while nothing can be
seen, and what the light uncovers is already different. No cross-dissolve, no two bodies at some
blend.

#### The small one, seventy-two times

This animation took five goes. The four that failed are worth keeping, because none of them failed
for the reason I expected going in.

1. **Nothing at all.** `clearAlert` left a pleased face and that was the whole event — and a poke
   leaves the same face, so advancing a stage looked exactly like being prodded.
2. **Two auspicious clouds**, a scaled-down realm breakthrough. A diluted version of an impressive
   thing reads as weak rather than as small, and it happened beside the body rather than to it.
3. **A spark, a breath, a ripple and a vein.** Four effects standing in for one event.
4. **A shed skin**, peeling off and fluttering away. That one was at least a real event with a
   before and an after, and it went on looks: a torn crescent coming off a soft round body is a
   faintly alarming image for something that is meant to be good news.

What it is now is the **first beat of a realm breakthrough at a smaller scale**. Qi dust arrives from
outside and is taken in, and the body shines — up over two thirds of a second, **held at full for
half a second**, then out. 1.6 seconds in total.

**That looks like mistake 2 and is not, and the difference is the whole lesson.** The clouds were a
*decoration* of the big sequence scaled down — the part of it with no mechanism behind it. The dust
is the part that means something: it is literally 修为 arriving, it is the same dust the keyboard
knocks loose, and a stage filling up is exactly that having happened. Borrowing the mechanism reads
as the same event at a smaller size. Borrowing the flourish reads as a cheap copy of a better one.

The three tiers are told apart by **how far the dust comes from**: one body radius for a keystroke,
1.5 for a stage, 2.2 for a realm. Those three numbers carry the sense of scale between the three
events and they live in two different files, so there is an assertion holding them in order.

**The hold in the middle is the part that matters.** The first cut of this put a spike on the
brightness and called that a brightening — but a spike is a flicker, and a body that flickers has
not done anything. What reads as a breakthrough is the body becoming a lantern and *staying* one
long enough to be looked at.

That light is its own quantity rather than a louder `absorbFlash`. That one is shared with typing
and with eating and decays in a fifth of a second by design, and a sustained light cannot be built
out of something whose whole purpose is to be brief. The per-speck flicker `absorb` produces is kept
on top of the steady glow, though, because it is what ties the light to the dust rather than letting
the two look like separate things happening at once.

**And the light has to leave the body.** Washing the body pale on its own reads as the colour being
turned down, not as light coming out — "发强光" is about what leaves, not about what the body looks
like. So the existing halo rises with it and stretches from 1.5 body radii to 2.1, which is still
inside the 2.2 that `bounds()` already reserves for decoration, so a breakthrough costs no extra
repaint area. Inside the membrane it is a radial gradient rather than flat white: white at the
middle, the realm's colour at the rim, so a shining body is still visibly *this* body. Flat white at
the strength this needs washes it to a white ball.

**There were also qi veins, and they are gone too.** One per stage, one to nine, clipped to the
body outline. They existed to give a stage something that *stayed* changed, on the argument that a
one-off flourish over a state that does not move is a flicker however well drawn.

That argument was sound while a stage was a **click** — something you did and wanted a receipt for.
Stages advance by themselves now, which makes the beat ambient rather than transactional, and
ambient progress does not need a receipt. They went on looks in the end, and the looks verdict was
easier to accept knowing the mechanical case had already weakened underneath it.

(The flowing veins section five of the plan has owed since it was written are still owed. That debt
is about the last four days of a run having nothing to look at, which is a different problem from
giving a stage a referent.)

Taking a breakthrough is also one function now rather than two. Answering the alert and poking a
ready pet in seclusion had drifted apart, and the seclusion path called `breakThrough` and
`applyLook` and nothing else — so taking a *realm* in seclusion changed the colour and skipped the
array, the charms, the shell and the cocoon entirely, and finishing the whole ladder in seclusion
skipped the ordeal. Nobody would have reported that; they would have assumed there was nothing
there.

#### Why the column went

The first three passes at this all landed somewhere in the visual language of science fiction, and
retinting was never going to fix it. Four things were wrong, and each one names its replacement.

**It was straight.** The genre's imagery is curvilinear — cloud, qi, veins, lotus — and a vertical
shaft with soft gradients in it is a transporter beam. The enclosure is a *bud* now: two curves
bowing out of a ring and converging above the pet.

**It had no writing in it.** Seal script is central to the genre, and this repo already drew a
decent talisman that the breakthrough ignored completely. Eight of them wheel out one at a time now,
close around the body, ride the bud's waist while it is shut, and burn away as the new form comes
back. They carry 道 气 玄 元 灵 真 虚 极 rather than a letter, because the charms that fall out of the
keyboard are keys you actually pressed and this beat is not about typing.

**It had no structure.** Light in this genre is structured: arrays, a dais, the layers of a sunset.
A uniform gradient can only read as glow. So there is a formation array under the pet — three rings,
a graduated rim, a counter-rotating octagram, in perspective, accelerating through all three beats.

**And nothing in it was an object.** A breakthrough in the genre involves *things*: pills, charms,
arrays, ley lines. So the gather beat now hardens a crust of pale jade over the body — deliberately
not the realm colour, because the point of it is that it is a shell and not the pet — and it closes
over the face, which is what makes it read as being sealed in rather than repainted. 瓶颈 and 破境
are the genre's own words for a full stage and for breaking one, and neither had been on screen. The
crust cracks, the next realm's light comes up through the cracks, and in the last beat it bursts and
the pieces fly out through the dissolving cocoon.

Five things only the screen could tell me:

**The array is anchored under the body, not on the floor.** The floor is more physical and falls
apart the moment the pet is off it — one click can land mid-hop, and the composition comes apart
into an array on the carpet with a long spike reaching up to a slime in the air.

**A bud has to be pinched at both ends.** The first pass put its foot on the array's inner ring,
wider than its belly, and a shape that is widest at the bottom and comes to a point is a cone —
which is to say a wizard hat.

**Every line of the array is stroked twice**, the dark rim colour wide and underneath and the pale
core narrow on top, and the cage mixes white threads with dark ones. This is not styling. A pale
array on a near-white wallpaper is invisible and a dark one on a dark wallpaper is invisible, and
this app draws onto a desktop it has never seen.

**The charms had to move outward when the bud shut, not inward.** Tucked in at 1.3 radii they ended
up under the silhouette, which put the eight things this sequence is about behind the one opaque
object on screen.

**And the cloud had to be filled, not stroked.** A chain of tangent arcs is the correct construction
for 祥云 and comes out as a caterpillar: an unfilled scalloped line has no mass, so at thirty pixels
it is a squiggle. Three overlapping lobes with one curled tail is what reads as cloud at that size.

Separately, a bug that was in every gradient in this app: `addColorStop(1, 'rgba(0,0,0,0)')` fades
to transparent **black**, and Canvas interpolates stops non-premultiplied, so the ramp passes
through half-alpha dark grey — which over a dark background is darker than the background. It is why
a beam of light kept reading as a column of smoke, and I retinted the opaque end twice before
noticing the smoke was coming from the transparent one. One function in `colour.ts`, five call
sites.

The look change is a one-shot request — `takeLookRequest()` — rather than something the caller
times, and it had to be, because the frame loop applies the look for its own reasons: a single
absorbed speck of dust would have put the new form on early and left the reveal with nothing to
reveal. The guard for that is `isChangingRealm`.

Two things that were not obvious until it was on screen:

**The column cannot hide the body by itself.** It is three nested slabs, and only the innermost is
opaque — which is narrow, so the old silhouette showed on either side of a bright stripe. What
actually hides it is a separate bloom centred on the body, opaque well past its own edge. That
started as one white-into-colour gradient, and a single gradient has to hold full alpha through the
colour shift to stay opaque, which draws a hard ring at the outer edge; on a pale desktop it looked
like a soap bubble. It is two passes now: a soft realm-coloured glow, and a smaller genuinely white
disc on top.

**The bloom has to fade faster than the column.** Fading them together is a crossfade between two
slimes. The figure has to come back inside a column that is still standing, so they are two
separate quantities on two different curves — the veil is gone by 60% of the beat, and the column
holds full strength for the first 35% and only then thins.

And the column's own gradient uses the pale half of the palette and white, never `edge`. That was
fine for 金丹, whose edge is a warm gold. 合体 is `#2b3894` and 大乘 is `#221c3d`, and a beam of
light faded through either of those is a column of smoke.

### Charms are a count now, and they set the odds

A talisman charm used to be worth a sliver of qi and nothing else — `keycapValue`, about **1.86
seconds of output**. Picking one up was a reward you could not see, which is a strange thing to send
the pet across the desktop for.

They are counted instead, and the count sets **the odds on a realm**: `min(100%, 60% + 0.4% x
held)`, so a hundred banked makes crossing a certainty. 修为 gets you to the threshold; charms
decide whether crossing it works.

Stages are free and automatic. Seventy-two clicks a run to confirm something that was never a
decision is a chore rather than an interaction — and the pet hopping to collect each one is the
"nothing may interrupt you" guardrail being broken seventy-two times.

Taking their qi away costs the economy nothing worth measuring — 1.86 seconds against a ladder
measured in days — so this is a re-purposing rather than a nerf. It is also what lets the number be
priced in the hundreds: the supply is capped in Rust at one charm per 5.5 seconds of typing, so a
heavy run banks something like four thousand, and a cost of forty is a real decision where a cost
of two would be noise.

**The guardrail that cannot move: charms never decide whether you can.** The same sentence is at the
top of the window-eating code. They move the odds; sixty percent with nothing banked is "a real
chance with none of them", not "come back when you have saved up".

**Stages briefly cost forty charms each, and that was a mistake worth recording.** Convenience and
insurance came out of the same pot, so the spend needed a floor it would not dig below, and with the
floor at a hundred you needed a hundred and forty banked before automation fired at all. Every step
of that reasoning is right and the conclusion is wrong: it meant the feature did nothing for the
whole early game — the part with most of the seventy-two stages in it and the most clicking to do. A
feature that switches itself off exactly when it is most wanted does not have a tuning problem.

Stages are free now and the pot has one job, so "convenience must not eat the insurance" is not a
problem being held off by a threshold; it is a problem that no longer exists.

**A realm edge still asks.** Those eight are the ones with something to decide — go now at these
odds, or wait and bank more — and crossing one spends the whole hoard on a dice roll. Doing that on
somebody's behalf while they are not watching is not a convenience either.

#### 御符: throwing the pet spends the surplus on fireworks

**The size of the problem first.** The odds on a realm clamp at certainty, and a *successful*
crossing spends nothing — so with a hundred banked the failure rate is zero and the expected spend
over a whole run is **zero**, against a supply of about four thousand. Past the first hundred, every
charm the pet ever ran across the desktop to fetch was worth exactly nothing. That is worse than the
1.86 seconds of qi they used to be worth.

**Throw the pet hard enough and charms go with it, to detonate against the edge of the desktop.**

| | |
|---|---|
| Threshold | 1800 px/s of **raw hand speed** (placing it down is under 300; a deliberate flick runs 2000–4000) |
| Count | one at the threshold up to five past 3600 px/s, fanned |
| Return | **none at all** |

That last row is deliberate and it is the most important line in the design. **Trying to make the
surplus *useful* was the wrong instinct**: a sink that returns progress becomes the optimal thing to
do, and "throw your pet at the wall repeatedly" is not a play pattern to design toward. A sink that
returns *spectacle* costs the economy nothing and gives a dead number something to be.

The threshold reads the **raw** hand velocity rather than the speed the body leaves with. That one
has been through `ThrowTransfer` and a clamp — two adjustments that exist to make the pet feel right
and which have nothing to say about how hard somebody meant to throw it.

**It only ever spends the surplus, never the hundred keeping the next realm safe.** This is the
automatic-stage mistake a second time — convenience drawn from the insurance pot, with the spending
happening where the player is not looking — and it would be worse here, because a throw is a playful
gesture and a hidden penalty on one is a trap. It also never scolds you for being poor: with no
surplus, a throw is just a throw.

Two things worth keeping from building it:

`spareAt` was wrong the first time. It returned the *whole* hoard once the odds were covered rather
than the excess over the line, so a hundred and two charms reported a hundred and two spare and
spending five off that left ninety-seven — below the line the function exists to protect. It read
correctly and did the opposite of its own docstring. The assertion caught it.

And the blast is nudged *inside* the wall it struck rather than pinned to the pixel of impact.
Pinning it is what actually happened and throws half the flash off the canvas — correct, and it
halves the one frame anybody sees.

#### What a failed realm costs, and why failure is allowed at all

Section 4.2 of the plan used to say flatly that **breakthroughs cannot fail**, on the grounds that a
desk toy costing twenty-five yuan does not get to take hours of progress off somebody. That sentence
left itself an exit: *it has to be a risk the player chose, not the default*. Charms raising the odds
is exactly that exit, and the risk lands on **eight of the seventy-three breakthroughs in a run** —
the other seventy-two are still certainties.

A failure costs:

- **The whole hoard.** Not a stake — there is no interface for choosing one, so "your charms decide
  the odds" can only mean all of them are in play. This is the sharpest part of it, because it makes
  the *next* attempt worse than this one would have been rather than merely undoing this one.
- **A fifth of the current stage's requirement.** Of the *stage*, which is the only reading that
  maps onto something that exists: qi is one running number holding progress through the stage you
  are on, and the eight behind it spent theirs on the way past. There is no stored realm total to
  take a share of.
- **Never a stage you already paid for.** The set-back is floored at zero, and that is the line the
  plan actually drew.

Worth stating in time, because the same fraction is two very different prices at the two ends:
half a minute at 练气, two minutes at 金丹, and **about fifty minutes at 大乘** at full output — two
and a half hours at the idle floor.

**And each failure adds ten points to that realm's floor, permanently.** Not in the brief; it is
here because sixty percent with no pity has a tail. Four failures in a row is a one-in-forty event,
and four failures at 大乘 is the better part of an afternoon. Dice do not get to take an afternoon
off somebody. With it, the fifth attempt is a certainty however the first four went. A rebirth clears
the counters, or the second climb would be quietly easier than the first for a reason nobody could
see.

Hovering gains a line at a realm edge, and it is a phrase rather than a percentage — 无虞 / 稳妥 /
可试 / 凶险, plus how many more charms would make it certain. A percentage is a number on screen and
the guardrails are explicit about those, but "about to try something that might not work" is exactly
what somebody standing there needs before they click. A failure then says one line, which is the
only place the charm cost is ever spelled out: without it, "my qi went down and my charms are gone"
is a bug report rather than a mechanic.

#### 法宝 is cancelled, not deferred

There was a whole section of plan for it: feed, digest, produce a treasure, four slots, auto-dismantle
the worse ones, a comparison popup for the better ones, five tiers and eight production-side affixes.
It is deleted.

The reason is not that there was no time. Its core was **a hidden stat panel** — and even with the
inventory designed away, you still need somewhere to look at what you are wearing, and that place is
a panel. The first guardrail says no panels. It broke a second one too: every slot is one more "there
is a better one" asking for an answer, and one to three drops a day times four slots is several
interruptions a day, where the guardrail says nothing may need checking on a schedule. A design that
hits two guardrails at once is not a scheduling problem.

The question it was there to answer — *what does typing get me besides qi* — is answered by the
charm count instead: one number, two uses, no interface.

### 机缘: the lucky find, and why it has to expire

Two to four times a working day the pet comes across something — 「拾得下品灵石三枚」,
「石缝里挖出半截灵根」, 「打了个嗝，竟吐出灵光」 — and a bubble says so. Clicking it takes the find.
**Ignoring it makes it go away for good after ninety seconds.**

That last sentence is the reason the system is allowed to exist, and it came before any of the
numbers. A reward that waits for you is a chore with a bow on it: it becomes something to check, and
the guardrails say nothing here may need checking on a schedule. A reward that expires is a
surprise. Which forces the amount to be small: **five to fifteen minutes** of the pet's own current output,
against a ladder measured in days. Missing
every single find in a run costs about as much as a long lunch.

It is deliberately **not** put through `raiseAlert`. That machinery persists: it hops on a beat
until answered, and quietens rather than leaves. Sending a lucky find through it would have turned a
surprise into an errand, which is precisely what the section forbids.

Three things the scheduling has to get right, none of which can be checked by looking at it — which
is why they are all asserted:

**The reward is in seconds of output, not in qi.** A flat number of qi would be a morning's work at
练气 and invisible at 大乘. Every number in this project has to be written to avoid that trap, and
this is the cheapest place to get it wrong.

**Coming back to the machine pulls a pending find forward, and cannot mint one.** Twenty minutes
away and then activity is the moment a find is most welcome, because it is the one moment the pet is
being looked at on purpose. But the nudge is bounded and floored: a return can move the next find
closer by at most eight minutes and never nearer than eight minutes from now. Without that bound,
stepping away and back would *produce* finds, and anyone who noticed could farm it. There is an
assertion that hammering the return twenty times does not walk one in.

**An ignored find is booked exactly like a taken one.** Same call, same distribution. A missed find
must not come back sooner to make up for it — missing one is meant to cost nothing *and* change
nothing, and "the game quietly compensates you" is a different feeling from "that was luck".

Also handled: a `nextAt` further out than the longest possible gap can only come from a clock that
has been wound back, and waiting months for something with no visible timer is indistinguishable
from the feature being broken. Arming repairs it.

The clock only runs while the app does, so "two to four a day" counts time in front of the machine
rather than time on Earth — otherwise leaving it running overnight would mean waking up owed a
queue, and a queue is the one shape this must never take. Seclusion suppresses finds entirely: that
switch means nothing asks for anything, and a bubble offering something is still a bubble.

### Reaching the top, and what you keep

The seventy-second breakthrough is not allowed to look like the seventy-first. It gathers — held
down, trembling faster and brighter — and then goes off, throwing the body open and upward to come
down wearing a colour it has never worn. It cannot be failed: losing four days to a dice roll on a
desk toy buys drama with a refund.

**Every ascension adds a band of light, and the seventh makes seven.** Red, orange, yellow, green,
cyan, blue, violet, turning at different speeds and alternating direction so they weave rather than
sitting in a rosette. It is the only thing here a rebirth does not take back: everything else says
where this run has got to, and the bands say how many runs there have been.

They also fill the gap the pacing leaves. Nearly half the ladder is the final realm, which is
roughly two days where no breakthrough lands and nothing changes — after a first ascension there is
always something moving.

The cost is honest and worth stating: a pet with bands never fully stands down. They turn, so it
holds the same 20 Hz repaint that sleeping already gets, which the measurements put at about a
third of the full-rate cost. Nobody pays it until they have finished a run.

### Rebirth is in Settings, and that is deliberate

Realm, stage and qi reset. Ascensions, the output multiplier, the bands and the daily allowance all
survive — the allowance in particular stays at eight, because having to climb back from one a day
would make a second run meaner than the first, which is backwards for something unlocked by
finishing.

It is the only irreversible action in the app, and it lives behind two clicks in a window you have
to open on purpose. Clicking the pet is how you poke it; making that same gesture able to erase four
days, with nothing between a misplaced click and the loss, would be indefensible. The force kill
uses a two-click confirmation for the same reason, but its worst case is one window and this one's
is the whole save, so it gets the extra distance as well.

The one-time line after an ascension — `此身已证大道 · 设置中可转生重历` — is the only place it is
advertised. That is not an interruption: the button was pressed a second earlier.

### Qi is a function of time, not a counter

Nothing adds qi a frame at a time. It is rate times elapsed seconds, evaluated whenever anyone
asks, so one call covers a tick, a lunch break, and a fortnight with the machine switched off.
That is why there is no offline-earnings screen in this design and no way for one to be needed.

The subtlety is that the rate is not constant across a long gap: a stage that fills part way
through drops to the bottleneck for the remainder. Integrating in two pieces is the difference
between that and being quietly *rewarded* for staying away, which is the wrong incentive to ship by
accident. Both halves are asserted against, along with the property that matters more than either:
one long settle and ten short ones over the same gap have to land in the same place.

### The recurring cost is two multiplications every ten seconds

Bolting a game onto something whose headline optimisation is "4% of a core to sit still" is the
obvious way to throw that away. None of this is in the frame loop — a ten second timer brings the
qi up to date and asks whether a stage has filled, and that is the entire recurring cost.

The one thing that genuinely would have wrecked it is a breakthrough nobody answers. An alert hops
on a beat, hopping is full-rate rendering, and left overnight that is the stand-down gone *and* a
pet flailing at an empty chair. So an unanswered breakthrough quietens itself after three minutes,
into the same slow pulse that hovering produces. It is still waiting when you come back.

### The alert was already here

The swell, the beat, the quietening on hover, the clearing on click — all of it was built for
meeting reminders, and none of it ever knew what it was announcing, because `poke` runs whatever
action arrived with the alert. Deleting the calendar deliberately left the mechanism behind. A
breakthrough needed no new animation code at all.

### `npm run check`

The numbers in `realms.ts` will be re-tuned repeatedly, and `settle` is the piece most likely to be
quietly wrong while still looking plausible. Sixteen assertions, no test framework, two seconds:
accrual rate, the bottleneck split, one settle against ten over the same gap, a clock that jumps
backwards, overflow carried across a breakthrough, and a full walk of the ladder that has to land
on exactly 72 breakthroughs and about 3.8 days.

## The save

One file, `save.json`, in the platform's app-data directory. Today it holds one thing — where you
left the slime — which is one more thing than this used to remember.

Writing it is four steps and a spare copy. That is more ceremony than a pair of coordinates
deserves and the right amount for what goes in next:

1. refuse anything that is not JSON, so a bug upstream cannot commit a file that will not load;
2. write to a scratch file and **sync it to the disk**, so the bytes are really there;
3. copy the current save aside as `save.bak`;
4. rename the scratch file over the live one, which is atomic.

A crash at any point leaves either the old save or the new one, never half of either, and a live
file that will not parse on the next start falls through to the backup. All three paths are
exercised: a planted position comes back, and a deliberately truncated `save.json` is recovered
from `save.bak`.

This is not defensive programming for its own sake. An idle game's save *is* the player's holdings,
and the review pages of the games this one is following around are full of people who lost an
afternoon to a silent rollback.

### The shape lives in TypeScript

Rust stores opaque JSON and only checks that it parses. There is no struct for the save on that
side and there does not need to be, so the backend never changes as the schema grows. The only
reason it looks at the content at all is that a loader which cannot tell a good file from a damaged
one has no reason to keep a backup.

### Two things that were easy to get wrong

**Homing waits for the load rather than racing it.** Placing the slime in the default corner and
then teleporting it to the restored point a few frames later is a visible jump, on every launch,
and it would be the first thing anyone sees — so the frame loop holds off exactly the way it already
holds off for a viewport that is not laid out yet. If the read hangs, a one-second deadline lets the
pet appear anyway, and saving stays *off* for that session: writing a default position over a
perfectly good save is the one outcome worth refusing outright.

**Only a real change is written.** The signal for "the body has come to rest" also goes true when a
speech bubble finishes fading, so without comparing against what is already on disk, hovering the
pet and moving away would spend a write saying the slime is exactly where it already was. Positions
are rounded to whole pixels, which is what makes that comparison hold at all.

### One instance only

Two copies would take turns overwriting each other's progress, and the second one would look like
it was working right up until the first one wrote again. `tauri-plugin-single-instance` makes the
second launch leave without a word. There is nothing to raise for it — the overlay never takes
focus.

## Developing it

Two handles are attached to `window` for use from a devtools console:

- `__slime` — the live simulation object, for reading position, velocity and mood.
- `__typed(count)` — knocks that much dust loose without a keyboard, for tuning the density of the
  stream and the dent each speck leaves.
- `__dropGlyph(char)` — drops a key beside the pet without anyone having typed one. The real path
  needs Raw Input, which only exists inside Tauri.
- `__setStage(realm, stage, progress)` — jumps the body anywhere on the ladder and repaints it.
  Tuning the palette ramp and the size growth is otherwise gated on playing to 大乘, which is four
  days.
- `__raiseAlert(text)` — fires the whole attention performance immediately: swell, hop on a beat,
  quieten on hover, clear on click. Nothing raises an alert on its own yet, so this is the only way
  to see it.

**You cannot screenshot the overlay with a normal screen capture.** It is a transparent WebView2
window, so it is layered and DirectComposition-rendered: `BitBlt` from the screen DC omits it
entirely, and `PrintWindow` (even with `PW_RENDERFULLCONTENT`) comes back solid black. Both fail
silently, which looks exactly like the app having failed to draw. To check the rendering, open
`http://127.0.0.1:1420/index.html` in an ordinary browser while `tauri dev` is running — the Tauri
calls fail there and are handled, and everything visual behaves the same.

## Status

Verified **on Windows**: the Rust side compiles clean, TypeScript typechecks, the production bundle
builds, and the app runs at about 69 MB resident. The slime renders and simulates, tracks the
cursor, and the attention performance was confirmed visually — amber body, wide eyes, airborne with
the contact shadow shrinking away, speech bubble anchored to it.

**It remembers where you left it and how far along it is**, the body shows the realm, it eats the
keys you type, and swallowing a window is a fight whose difficulty and spoils move with the realm.
Ascension, the seven bands and rebirth are in. Serendipity and treasures are the two systems still
on paper — sections 4.4 and 12 of the plan. See [Cultivating](#cultivating).

Not built yet:

- Drag, throw and poke are wired and typecheck, but have only been exercised through synthetic
  events — they want a few minutes of actual mouse-in-hand testing.
- Eating a window is complete and typechecks **on Windows**, and the engulf, the abort and the
  unwind were confirmed visually. Not yet exercised with a mouse in hand, and `IsHungAppWindow`, the
  force kill and the `Resisting` path have never been run against a real hung app or a real save
  prompt. macOS and Linux have no backend for it at all — see [Platforms](#platforms).
- macOS and Linux are configured but unbuilt. The platform-specific dependencies resolve for both
  targets and nothing Windows-only is reachable from their build, but neither has been compiled,
  bundled or run, so every runtime claim about them is inference. The first things to distrust are
  the ones with no cross-platform equivalent to fall back on: whether `work_area()` excludes the
  macOS menu bar and Dock and the Linux panels, whether the always-on-top overlay actually floats
  above other applications' windows on each, and whether the repaint tuning still holds under
  WKWebView and WebKitGTK instead of DWM.
- Multi-monitor: the overlay is pinned to the primary monitor only.
- No autostart-on-login registration.
- No sound.
- The slime does not know about window edges, so it walks along the bottom of the screen rather than
  sitting on top of your windows.
