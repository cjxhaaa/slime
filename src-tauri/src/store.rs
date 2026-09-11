use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.slime.desk";
const CLIENT_ACCOUNT: &str = "google-client";
const TOKEN_ACCOUNT: &str = "google-tokens";

/// The OAuth client the user created in their own Google Cloud project.
///
/// Google issues a secret even for "Desktop app" clients, and it genuinely cannot be kept secret in
/// a program that ships to users — which is exactly why the flow in `oauth.rs` uses PKCE, where
/// security rests on the per-attempt verifier rather than on this value. It still goes in the OS
/// credential store rather than a config file, because it is a credential and belongs with them.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GoogleClient {
    pub client_id: String,
    #[serde(default)]
    pub client_secret: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tokens {
    pub refresh_token: String,
    pub access_token: String,
    /// Unix seconds. Compared against a small safety margin, never used bare.
    pub expires_at: i64,
    #[serde(default)]
    pub account: String,
}

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|error| error.to_string())
}

fn load<T: for<'de> Deserialize<'de>>(account: &str) -> Option<T> {
    let raw = entry(account).ok()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn save<T: Serialize>(account: &str, value: &T) -> Result<(), String> {
    let raw = serde_json::to_string(value).map_err(|error| error.to_string())?;
    entry(account)?
        .set_password(&raw)
        .map_err(|error| error.to_string())
}

fn clear(account: &str) {
    if let Ok(entry) = entry(account) {
        // A missing credential is the desired end state, so "it was not there" is not an error.
        let _ = entry.delete_credential();
    }
}

/// A client baked in at build time, so a finished build just has a Connect button.
///
/// This is how every shipped app that "just connects" does it: Google has no anonymous OAuth, so
/// somebody has to register a client once — but that somebody is whoever builds the app, not
/// whoever runs it. Set `SLIME_GOOGLE_CLIENT_ID` (and secret) when building and the credential
/// fields disappear from Settings entirely.
///
/// Shipping the secret is fine here and is what Google intends for installed apps: a desktop client
/// secret is explicitly not treated as confidential, which is exactly why this flow uses PKCE — the
/// security rests on the per-attempt verifier, not on that value staying hidden.
fn built_in_client() -> Option<GoogleClient> {
    let client_id = option_env!("SLIME_GOOGLE_CLIENT_ID")?.trim();
    if client_id.is_empty() {
        return None;
    }
    Some(GoogleClient {
        client_id: client_id.to_string(),
        client_secret: option_env!("SLIME_GOOGLE_CLIENT_SECRET")
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

/// True when this build carries its own credentials and the user never needs to see them.
pub fn has_built_in_client() -> bool {
    built_in_client().is_some()
}

/// A credential pasted in Settings wins, so a build with its own client can still be pointed at a
/// different Cloud project without rebuilding.
pub fn load_client() -> Option<GoogleClient> {
    load(CLIENT_ACCOUNT).or_else(built_in_client)
}

pub fn save_client(client: &GoogleClient) -> Result<(), String> {
    save(CLIENT_ACCOUNT, client)
}

pub fn load_tokens() -> Option<Tokens> {
    load(TOKEN_ACCOUNT)
}

pub fn save_tokens(tokens: &Tokens) -> Result<(), String> {
    save(TOKEN_ACCOUNT, tokens)
}

pub fn clear_tokens() {
    clear(TOKEN_ACCOUNT);
}
