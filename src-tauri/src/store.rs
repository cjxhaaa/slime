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

pub fn load_client() -> Option<GoogleClient> {
    load(CLIENT_ACCOUNT)
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
