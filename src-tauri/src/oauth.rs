use std::sync::Mutex;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::store::{self, GoogleClient, Tokens};

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";

/// Read-only, and only events. There is no separate Meet API — a Meet link is a property of a
/// calendar event (`conferenceData` / `hangoutLink`), so reading events is the whole requirement.
/// Nothing here ever needs to write to the calendar, so it never asks for the ability to.
const SCOPES: &str = "openid email https://www.googleapis.com/auth/calendar.events.readonly";

/// Refresh this far before actual expiry, so a request never starts with a token that dies mid-flight.
const REFRESH_MARGIN_SECS: i64 = 120;

#[derive(Default)]
pub struct AuthState {
    tokens: Mutex<Option<Tokens>>,
}

#[derive(Serialize)]
pub struct ConfigStatus {
    has_client: bool,
    connected: bool,
    account: String,
}

#[tauri::command]
pub fn google_config_status() -> ConfigStatus {
    let tokens = store::load_tokens();
    ConfigStatus {
        has_client: store::load_client().is_some(),
        connected: tokens.is_some(),
        account: tokens.map(|t| t.account).unwrap_or_default(),
    }
}

#[tauri::command]
pub fn save_google_client(client_id: String, client_secret: String) -> Result<(), String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Client ID is required.".into());
    }
    store::save_client(&GoogleClient {
        client_id,
        client_secret: client_secret.trim().to_string(),
    })
}

#[tauri::command]
pub fn disconnect_google(state: tauri::State<'_, AuthState>) {
    store::clear_tokens();
    *state.tokens.lock().unwrap() = None;
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: i64,
}

#[derive(Deserialize)]
struct UserInfo {
    #[serde(default)]
    email: String,
}

/// Runs the whole installed-app flow and returns the connected account's address.
///
/// The consent itself happens in the user's own browser, where they can see the scopes and the
/// account they are approving — which is the only place that decision belongs.
#[tauri::command]
pub async fn begin_google_auth(
    app: AppHandle,
    state: tauri::State<'_, AuthState>,
) -> Result<String, String> {
    let client = store::load_client().ok_or("Add your Google OAuth client ID first.")?;

    // Port 0 lets the OS pick a free port; the redirect URI is built from whatever it gave us, so
    // two instances can never collide on a hardcoded port.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|error| format!("could not open the loopback listener: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier = random_urlsafe(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let expected_state = random_urlsafe(32);

    let auth_url = format!(
        "{AUTH_ENDPOINT}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}\
         &code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        urlencoding::encode(&client.client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(&challenge),
        urlencoding::encode(&expected_state),
    );

    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(auth_url, None::<&str>)
        .map_err(|error| format!("could not open the browser: {error}"))?;

    let callback = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        await_callback(listener),
    )
    .await
    .map_err(|_| "Timed out waiting for the Google sign-in to finish.".to_string())??;

    if callback.state != expected_state {
        // A mismatch means this response did not come from the request we just made.
        return Err("The sign-in response did not match this request; nothing was saved.".into());
    }
    let code = callback.code.ok_or_else(|| {
        callback
            .error
            .clone()
            .unwrap_or_else(|| "Google did not return an authorization code.".into())
    })?;

    let http = reqwest::Client::new();
    let mut form = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code),
        ("client_id", client.client_id.clone()),
        ("code_verifier", verifier),
        ("redirect_uri", redirect_uri),
    ];
    if !client.client_secret.is_empty() {
        form.push(("client_secret", client.client_secret.clone()));
    }

    let response = http
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("token request failed: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Google rejected the token request ({status}): {body}"));
    }
    let token: TokenResponse = response
        .json()
        .await
        .map_err(|error| format!("could not read the token response: {error}"))?;

    let refresh_token = token.refresh_token.ok_or(
        "Google did not return a refresh token. Remove the app's access in your Google account \
         security settings and connect again.",
    )?;

    let account = fetch_email(&http, &token.access_token).await.unwrap_or_default();
    let tokens = Tokens {
        refresh_token,
        access_token: token.access_token,
        expires_at: chrono::Utc::now().timestamp() + token.expires_in.max(0),
        account: account.clone(),
    };
    store::save_tokens(&tokens)?;
    *state.tokens.lock().unwrap() = Some(tokens);
    Ok(account)
}

/// A valid access token, refreshed if the stored one is at or near expiry.
pub async fn access_token(app: &AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let state = app.state::<AuthState>();

    let cached = {
        let guard = state.tokens.lock().unwrap();
        guard.clone()
    };
    let tokens = match cached {
        Some(tokens) => tokens,
        None => {
            let loaded = store::load_tokens().ok_or("Google is not connected.")?;
            *state.tokens.lock().unwrap() = Some(loaded.clone());
            loaded
        }
    };

    if tokens.expires_at - REFRESH_MARGIN_SECS > chrono::Utc::now().timestamp() {
        return Ok(tokens.access_token);
    }

    let client = store::load_client().ok_or("The Google OAuth client is missing.")?;
    let http = reqwest::Client::new();
    let mut form = vec![
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", tokens.refresh_token.clone()),
        ("client_id", client.client_id.clone()),
    ];
    if !client.client_secret.is_empty() {
        form.push(("client_secret", client.client_secret.clone()));
    }

    let response = http
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("refresh failed: {error}"))?;
    if !response.status().is_success() {
        // A refresh token can be revoked from the Google account page at any time. Dropping the
        // stored tokens here means the UI shows "not connected" instead of retrying forever.
        if response.status() == reqwest::StatusCode::BAD_REQUEST {
            store::clear_tokens();
            *state.tokens.lock().unwrap() = None;
            return Err("Google sign-in has expired. Connect again in Settings.".into());
        }
        return Err(format!("refresh failed with status {}", response.status()));
    }
    let refreshed: TokenResponse = response
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let updated = Tokens {
        // A refresh response usually omits the refresh token; keeping the old one is required.
        refresh_token: refreshed.refresh_token.unwrap_or(tokens.refresh_token),
        access_token: refreshed.access_token.clone(),
        expires_at: chrono::Utc::now().timestamp() + refreshed.expires_in.max(0),
        account: tokens.account,
    };
    store::save_tokens(&updated)?;
    *state.tokens.lock().unwrap() = Some(updated);
    Ok(refreshed.access_token)
}

async fn fetch_email(http: &reqwest::Client, access_token: &str) -> Option<String> {
    let info: UserInfo = http
        .get(USERINFO_ENDPOINT)
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    Some(info.email)
}

struct Callback {
    code: Option<String>,
    state: String,
    error: Option<String>,
}

/// Accepts exactly one loopback request, answers it with a page the user can close, and returns the
/// query parameters. Only 127.0.0.1 is ever bound, so nothing off-machine can reach it.
async fn await_callback(listener: TcpListener) -> Result<Callback, String> {
    let (mut socket, _) = listener
        .accept()
        .await
        .map_err(|error| format!("loopback accept failed: {error}"))?;

    let mut buffer = [0u8; 4096];
    let read = socket
        .read(&mut buffer)
        .await
        .map_err(|error| format!("loopback read failed: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..read]);

    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    let body = "<!doctype html><meta charset=utf-8><title>Slime</title>\
        <body style=\"font:16px system-ui;padding:48px;color:#222\">\
        <p>Slime is connected. You can close this tab.</p>";
    let _ = socket
        .write_all(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                 Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .as_bytes(),
        )
        .await;
    let _ = socket.flush().await;

    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut state = String::new();
    let mut error = None;
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let value = urlencoding::decode(value).unwrap_or_default().to_string();
        match key {
            "code" => code = Some(value),
            "state" => state = value,
            "error" => error = Some(value),
            _ => {}
        }
    }
    Ok(Callback { code, state, error })
}

fn random_urlsafe(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    URL_SAFE_NO_PAD.encode(buffer)
}
