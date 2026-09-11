# OAuth sensitive-scope verification — what to submit

Slime requests `calendar.events.readonly`, which Google classes as a **sensitive** scope. Sensitive
scopes need verification but **not** the third-party security assessment that restricted scopes
require, so this is paperwork and a video, not an audit.

Review takes **3–5 business days** once submitted.

## Prerequisites, in order

Each one blocks the next.

1. **Published branding status.** Done — the app is in production with the homepage, privacy policy
   and terms filled in.
2. **Domain ownership verified in Google Search Console** for the authorized domain
   (`cjxhaaa.github.io`). Not done yet — see below.
3. **Demo video on YouTube.** Not done yet — shot list below.
4. **Scope justification.** Written below, ready to paste.

## 2. Verifying the domain in Search Console

Go to [Search Console](https://search.google.com/search-console), add a property of type
**URL prefix** (not Domain — that needs DNS records, which a `github.io` subdomain does not give
you), enter:

```
https://cjxhaaa.github.io/slime/
```

Choose the **HTML file** verification method. It gives a file named something like
`google1a2b3c4d5e6f.html`. Put that file in `docs/` in this repo and push; GitHub Pages serves it
within a minute or two, then press Verify.

> If Google rejects a `github.io` subdomain here, the fallback is a domain you actually own
> (cheap, points at the same GitHub Pages site) — that is the one step of this process that money
> can shorten.

## 3. The demo video

Google is specific about what it has to show, and the third item is the one people miss:

- the OAuth grant process as a user experiences it;
- the consent screen displaying **the correct app name** (Slime);
- **the browser address bar, with your OAuth client ID visible in the URL** — so record the whole
  browser window, not a cropped region, and do not blur the address bar;
- how the data is used, in detail, for each sensitive scope.

A shot list that covers all four, about 90 seconds:

1. Slime sitting idle on the desktop. Open Settings from the tray or by right-clicking the pet.
2. Press **Connect**. The browser opens — **pause here long enough that the address bar is legible**
   and the `client_id=1027946432960-…` parameter can be read.
3. Show the account chooser, pick the account, then the consent screen — **let the app name "Slime"
   and the requested calendar permission be readable**. Tick the calendar permission.
4. Back in Settings, show **Next up** listing real upcoming meetings. This is the scope being used:
   the app reads event titles and start times.
5. Wait for (or trigger via **Tray → Test reminder**) the reminder. Show the pet turning amber and
   bouncing, with the bubble naming the meeting and counting down. Click it and show the Meet link
   opening. This is the third field the scope provides — the conferencing link.
6. End on Settings → **Disconnect**, to show access can be withdrawn from inside the app.

Upload to YouTube. **Unlisted is fine**, public is not required. Paste the link into the submission.

## 4. Scope justification — paste this

**Scope:** `https://www.googleapis.com/auth/calendar.events.readonly`

> Slime is a Windows desktop pet that reminds the user about their own upcoming meetings. It reads
> the signed-in user's calendar events and uses exactly three fields from each upcoming event: the
> title, to name the reminder; the start time, to decide when to show it and to render a live
> countdown; and the conferencing link (`hangoutLink` or `conferenceData`), so that clicking the
> reminder opens the meeting. Approximately five minutes before an event begins, the on-screen pet
> changes colour, animates, and displays the event title with a countdown.
>
> A narrower scope is not sufficient. `calendar.readonly` is broader, not narrower, as it also
> exposes calendar metadata and settings the app never uses. There is no read-only scope limited
> further than `calendar.events.readonly` — the app already requests the narrowest scope that
> returns event start times and conferencing links, which are the minimum needed to know when a
> meeting starts and how to join it. No write scope is requested, because the app never modifies
> the calendar.
>
> Event data is requested directly from the Google Calendar API by the application running on the
> user's own computer, held in memory to render the reminder, and discarded. It is never written to
> disk, logged, or transmitted to the developer or to any third party. There is no server component
> and no account. OAuth tokens are stored in the Windows Credential Manager on the user's machine.

## What is still only yours to do

- Search Console verification (needs your Google account)
- Recording and uploading the video
- Pressing Submit in the Verification Center

Everything else in this document is finished and live.
