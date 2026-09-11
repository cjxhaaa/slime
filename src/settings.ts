import { invoke } from '@tauri-apps/api/core';

// A settings page that fails silently is indistinguishable from one that never loaded, which is
// exactly the hole this fell into: a blank white window with no way to tell whether the document,
// the stylesheet, the script or the IPC was the thing that broke. Anything thrown from here on is
// painted into the page and echoed to the dev log.
console.warn(`SETTINGS_BOOT url=${location.href} ready=${document.readyState}`);
window.addEventListener('error', (event) => {
  console.warn(`SETTINGS_ERROR ${event.message} @ ${event.filename}:${event.lineno}`);
  showFatal(`${event.message}
${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  console.warn(`SETTINGS_REJECTION ${String(event.reason)}`);
  showFatal(String(event.reason));
});

function showFatal(message: string): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'margin:12px;padding:12px;border-radius:8px;background:#c0483f;color:#fff;' +
    'font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;position:relative;z-index:99';
  box.textContent = `Settings failed to start:
${message}`;
  document.body.prepend(box);
}

interface ConfigStatus {
  has_client: boolean;
  connected: boolean;
  account: string;
  built_in_client: boolean;
}

interface Meeting {
  id: string;
  title: string;
  start: string;
  minutes_until: number;
  meet_url: string | null;
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const statusLine = el<HTMLParagraphElement>('status');
const message = el<HTMLParagraphElement>('message');
const clientId = el<HTMLInputElement>('client-id');
const clientSecret = el<HTMLInputElement>('client-secret');
const saveButton = el<HTMLButtonElement>('save');
const connectButton = el<HTMLButtonElement>('connect');
const disconnectButton = el<HTMLButtonElement>('disconnect');
const refreshButton = el<HTMLButtonElement>('refresh');
const quitButton = el<HTMLButtonElement>('quit');
const howto = el<HTMLDetailsElement>('howto');
const meetingList = el<HTMLUListElement>('meetings');
const byoClient = el<HTMLDivElement>('byo-client');

function say(text: string, kind: 'info' | 'error' = 'info'): void {
  message.textContent = text;
  message.dataset.kind = kind;
}

async function refreshStatus(): Promise<ConfigStatus> {
  const status = await invoke<ConfigStatus>('google_config_status');
  statusLine.textContent = status.connected
    ? `Connected as ${status.account || 'your Google account'}`
    : status.has_client
      ? 'Client saved — not connected yet'
      : 'Not connected';
  statusLine.dataset.connected = String(status.connected);
  disconnectButton.hidden = !status.connected;
  connectButton.textContent = status.connected ? 'Reconnect' : 'Connect Google';

  // A build that carries its own credentials should look like every other app that connects to
  // Google: one button. The whole bring-your-own-client apparatus — the walkthrough, the two
  // fields, the Save button — is setup work that only exists when the build has no client of its
  // own, so it disappears entirely rather than sitting there looking like something to fill in.
  byoClient.hidden = status.built_in_client;
  saveButton.hidden = status.built_in_client;
  // The walkthrough only needs to be open while there is still setting up to do.
  howto.open = !status.has_client && !status.built_in_client;
  return status;
}

function formatWhen(meeting: Meeting): string {
  const start = new Date(meeting.start);
  const minutes = Math.round((start.getTime() - Date.now()) / 60000);
  const clock = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (minutes < 0) return `${clock} · started`;
  if (minutes < 60) return `${clock} · in ${minutes} min`;
  return clock;
}

async function loadMeetings(): Promise<void> {
  refreshButton.disabled = true;
  try {
    const meetings = await invoke<Meeting[]>('next_meetings');
    meetingList.replaceChildren();
    const upcoming = meetings.filter((meeting) => meeting.minutes_until >= -5);
    if (upcoming.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = 'Nothing in the next 12 hours.';
      meetingList.append(empty);
      return;
    }
    for (const meeting of upcoming) {
      const row = document.createElement('li');
      const title = document.createElement('div');
      // textContent, never innerHTML: these strings come from calendar invites, which anyone who
      // can put an event on your calendar controls.
      title.textContent = meeting.meet_url ? `${meeting.title} · Meet` : meeting.title;
      const when = document.createElement('div');
      when.className = 'when';
      when.textContent = formatWhen(meeting);
      row.append(title, when);
      meetingList.append(row);
    }
  } catch (error) {
    meetingList.replaceChildren();
    const failed = document.createElement('li');
    failed.className = 'muted';
    failed.textContent = String(error);
    meetingList.append(failed);
  } finally {
    refreshButton.disabled = false;
  }
}

saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  try {
    await invoke('save_google_client', {
      clientId: clientId.value,
      clientSecret: clientSecret.value,
    });
    // Never echoed back into the field afterwards — the value now lives in the OS credential store.
    clientSecret.value = '';
    say('Client saved. Now press Connect Google.');
    await refreshStatus();
  } catch (error) {
    say(String(error), 'error');
  } finally {
    saveButton.disabled = false;
  }
});

connectButton.addEventListener('click', async () => {
  // Deliberately left enabled. The wait can run for minutes and nothing about abandoning the
  // browser tab ends it, so disabling this was a dead button with no explanation; pressing it
  // again now cancels the stale attempt and starts over.
  const previousLabel = connectButton.textContent;
  connectButton.textContent = 'Waiting for browser…';
  say('Finish signing in in the browser. Press Connect again to start over.');
  try {
    const account = await invoke<string>('begin_google_auth');
    say(account ? `Connected as ${account}.` : 'Connected.');
    await refreshStatus();
    await loadMeetings();
  } catch (error) {
    say(String(error), 'error');
  } finally {
    connectButton.textContent = previousLabel;
  }
});

disconnectButton.addEventListener('click', async () => {
  await invoke('disconnect_google');
  say('Disconnected. The stored tokens were deleted.');
  await refreshStatus();
  meetingList.replaceChildren();
});

refreshButton.addEventListener('click', () => void loadMeetings());
quitButton.addEventListener('click', () => void invoke('quit_app'));

async function main(): Promise<void> {
  const status = await refreshStatus();
  if (status.connected) await loadMeetings();
}

void main();
