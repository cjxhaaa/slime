# OAuth verification — parked, and why

**Status: not pursued.** Slime runs in production against its own OAuth client without it. This
file records what verification would buy, why the attempt stopped, and the one finding that is
worth not rediscovering.

## What we gave up by stopping

Only two things:

- A one-time "Google hasn't verified this app" interstitial on first connect, which is clickable
  past via **Advanced → Go to Slime**.
- The **100-user cap** on an unverified app. Currently 2 of 100 are used.

Everything else works today. The app is in **production** publishing status, not Testing, so the
seven-day refresh-token expiry that makes Testing apps unusable does not apply.

## Why it stopped: `github.io` cannot pass brand verification

Brand verification kept rejecting the homepage with:

> 您的首页网址"https://cjxhaaa.github.io/"对应的网站未注册到您的名下。
> (The website for your home page URL is not registered to you.)

The homepage, privacy policy and terms were live and returning 200, the domain was verified in
Search Console as a URL-prefix property, and the pages were moved from `/slime/` to the domain root
to remove any path-scope ambiguity. **None of it mattered, because none of it was the problem.**

Google's [App Homepage requirements](https://support.google.com/cloud/answer/13807376) say the
homepage must not be hosted on *a third-party platform where you cannot verify that you own the
subdomain*. `github.io` is registered to GitHub, Inc. — Search Console can prove you control the
site, but the check is about who the **domain** is registered to, which is what the error says and
which no amount of Search Console work can change. Google's own developer forums carry the same
unresolved report for `vercel.app` and other platform subdomains, and Google's only stated
remediation is to move the homepage to a domain registered to you.

Three rounds were spent adjusting the Search Console side, which was never the broken side.

**If this is ever resumed, do not touch Search Console first.** Buy a domain, point it at the same
GitHub Pages site with a `CNAME` file, verify it in Search Console as a **Domain** property via DNS
TXT, and update the three Branding URLs. Before spending anything, confirm the Cloud project Owner
and the Search Console verified owner are the same Google account — Google requires that, and this
project has two accounts in play (`cjxhaaa@gmail.com`, `cjxh@vibe.us`) that have already been
crossed once.

## The site is still live and still worth keeping

`docs/` is published at <https://cjxhaaa.github.io/slime/>, and the same pages sit at the root of
the `cjxhaaa.github.io` repo. Those URLs are filled into the Branding page, which is a requirement
for production status independent of verification, so leaving them alone costs nothing.

## Material kept for a resumed submission

### Demo video shot list

Google is specific, and the third item is the one people miss:

- the OAuth grant process as a user experiences it;
- the consent screen displaying the correct app name (Slime);
- **the browser address bar, with the OAuth client ID visible in the URL** — record the whole
  browser window, do not crop or blur it;
- how the data is used, in detail, for each sensitive scope.

About 90 seconds:

1. Slime idle on the desktop. Open Settings from the tray.
2. Press **Connect**. Pause long enough that `client_id=1027946432960-…` is legible.
3. Account chooser, then the consent screen — let "Slime" and the calendar permission be readable.
   Tick the permission.
4. Back in Settings, **Next up** listing real meetings: this is the scope being used.
5. Trigger **Tray → Test reminder**. Show the pet turning amber and bouncing with the countdown
   bubble; click it and show the Meet link opening — the third field the scope provides.
6. End on **Disconnect**, showing access can be withdrawn from inside the app.

Unlisted on YouTube is fine.

### Scope justification

The box on the Data Access page caps at **1000 characters**, which the obvious draft overruns.
This is 989 and keeps all three things Google asks it to answer: what the data is used for, why a
narrower scope will not do, and where the data ends up.

**Scope:** `https://www.googleapis.com/auth/calendar.events.readonly`

> Slime is a Windows desktop pet that reminds the signed-in user about their own upcoming meetings. From each upcoming event it uses three fields: the title, to name the reminder; the start time, to schedule it and render a countdown; and the conferencing link (hangoutLink / conferenceData), so clicking the reminder joins the meeting. About five minutes before an event starts, the pet changes colour, animates, and shows the title with a countdown.
>
> A narrower scope does not exist. calendar.readonly is broader - it also exposes calendar lists, metadata and settings we never touch - and nothing read-only sits below calendar.events.readonly. No write scope is requested; the app never modifies the calendar.
>
> Events are fetched by the app on the user's own machine, held in memory to draw the reminder, and discarded. They are never written to disk, logged, or sent to the developer or any third party. There is no server and no account; OAuth tokens stay in Windows Credential Manager.
