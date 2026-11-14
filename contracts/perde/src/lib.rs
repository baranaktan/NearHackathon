//! Perde: an announcement registry for stealth-address payments on NEAR.
//!
//! The contract never holds user funds beyond a single call. `send` records an
//! announcement (stealth account, ephemeral public key, view tag, amount, time)
//! and forwards `attached_deposit - ANNOUNCE_FEE` to the stealth account, which
//! is a NEAR implicit account (64 lowercase hex chars = an ed25519 public key).
//! A Transfer to an implicit account creates it if it does not exist yet.
//!
//! It also keeps a public directory `account_id -> meta_address`, paid for by the
//! registrant with an exact, byte-accurate storage deposit.
//!
//! There is no owner, no admin method and no upgrade method.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, Promise};

/// Fee kept by the contract per announcement; pays the storage staking of the record.
pub const ANNOUNCE_FEE: NearToken = NearToken::from_millinear(2); // 0.002 NEAR
/// Minimum amount forwarded to the stealth account (lets it pay its own sweep gas).
pub const MIN_AMOUNT: NearToken = NearToken::from_millinear(10); // 0.01 NEAR
/// Maximum page size for `get_announcements`; larger requests are capped.
pub const MAX_PAGE: u64 = 200;
/// Maximum length of a meta-address, in bytes (all valid meta-addresses are ASCII).
pub const MAX_META_LEN: usize = 128;
/// Required prefix of a meta-address.
pub const META_PREFIX: &str = "perde:";

pub const EVENT_STANDARD: &str = "perde";
pub const EVENT_VERSION: &str = "1.0.0";

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Announcements,
    Directory,
}

/// Compact on-chain form of an announcement (89 bytes of value).
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredAnnouncement {
    pub stealth_pk: [u8; 32],
    pub ephemeral_pk: [u8; 32],
    pub view_tag: u8,
    pub amount: u128,
    pub timestamp_ms: u64,
}

/// JSON view of an announcement, as returned by `get_announcements` and logged in events.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnnouncementView {
    pub index: u64,
    pub stealth_account: String,
    pub ephemeral_pk: String,
    pub view_tag: u8,
    pub amount: U128,
    pub timestamp_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConfigView {
    pub announce_fee: U128,
    pub min_amount: U128,
    pub version: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct EventLog<'a, T: Serialize> {
    standard: &'a str,
    version: &'a str,
    event: &'a str,
    data: T,
}

#[near(contract_state)]
pub struct Perde {
    announcements: Vector<StoredAnnouncement>,
    directory: LookupMap<AccountId, String>,
}

impl Default for Perde {
    fn default() -> Self {
        Self {
            announcements: Vector::new(StorageKey::Announcements),
            directory: LookupMap::new(StorageKey::Directory),
        }
    }
}

/// Decodes exactly 64 lowercase hex characters into 32 bytes.
fn parse_hex32(value: &str, field: &str) -> [u8; 32] {
    let bytes = value.as_bytes();
    if bytes.len() != 64 {
        env::panic_str(&format!(
            "{field} must be exactly 64 lowercase hex characters"
        ));
    }
    let mut out = [0u8; 32];
    for (i, chunk) in bytes.chunks_exact(2).enumerate() {
        let hi = hex_nibble(chunk[0]);
        let lo = hex_nibble(chunk[1]);
        match (hi, lo) {
            (Some(h), Some(l)) => out[i] = (h << 4) | l,
            _ => env::panic_str(&format!(
                "{field} must be exactly 64 lowercase hex characters"
            )),
        }
    }
    out
}

fn hex_nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    }
}

fn to_hex(bytes: &[u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(64);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

fn view_of(index: u64, a: &StoredAnnouncement) -> AnnouncementView {
    AnnouncementView {
        index,
        stealth_account: to_hex(&a.stealth_pk),
        ephemeral_pk: to_hex(&a.ephemeral_pk),
        view_tag: a.view_tag,
        amount: U128(a.amount),
        timestamp_ms: a.timestamp_ms,
    }
}

fn emit_event<T: Serialize>(event: &str, data: T) {
    let log = EventLog {
        standard: EVENT_STANDARD,
        version: EVENT_VERSION,
        event,
        data,
    };
    let json = near_sdk::serde_json::to_string(&log)
        .unwrap_or_else(|_| env::panic_str("event serialization failed"));
    env::log_str(&format!("EVENT_JSON:{json}"));
}

#[near]
impl Perde {
    /// Records an announcement and forwards `attached_deposit - announce_fee` to
    /// `stealth_account`. Returns the announcement index.
    #[payable]
    pub fn send(&mut self, stealth_account: String, ephemeral_pk: String, view_tag: u16) -> u64 {
        let stealth_pk = parse_hex32(&stealth_account, "stealth_account");
        let ephemeral = parse_hex32(&ephemeral_pk, "ephemeral_pk");
        if view_tag > 255 {
            env::panic_str("view_tag must be in 0..=255");
        }
        let deposit = env::attached_deposit();
        let required = ANNOUNCE_FEE.saturating_add(MIN_AMOUNT);
        if deposit < required {
            env::panic_str(&format!(
                "attached deposit must be at least {} yoctoNEAR (announce_fee + min_amount)",
                required.as_yoctonear()
            ));
        }
        let amount = deposit.saturating_sub(ANNOUNCE_FEE);

        let index = u64::from(self.announcements.len());
        if self.announcements.len() == u32::MAX {
            env::panic_str("announcement log is full");
        }
        let record = StoredAnnouncement {
            stealth_pk,
            ephemeral_pk: ephemeral,
            view_tag: view_tag as u8,
            amount: amount.as_yoctonear(),
            timestamp_ms: env::block_timestamp_ms(),
        };
        let view = view_of(index, &record);
        self.announcements.push(record);

        emit_event("announce", [&view]);

        // `stealth_account` is a validated 64-hex implicit account id, which is always a
        // valid AccountId; a Transfer to it creates the account when it does not exist.
        let receiver: AccountId = stealth_account
            .parse()
            .unwrap_or_else(|_| env::panic_str("stealth_account is not a valid account id"));
        Promise::new(receiver).transfer(amount).detach();
        index
    }

    /// Returns up to `limit` (capped at 200) announcements starting at `from_index`.
    pub fn get_announcements(&self, from_index: u64, limit: u64) -> Vec<AnnouncementView> {
        let len = u64::from(self.announcements.len());
        if from_index >= len {
            return Vec::new();
        }
        let end = from_index.saturating_add(limit.min(MAX_PAGE)).min(len);
        (from_index..end)
            .map(|i| {
                let record = self
                    .announcements
                    .get(i as u32)
                    .unwrap_or_else(|| env::panic_str("announcement index out of range"));
                view_of(i, record)
            })
            .collect()
    }

    pub fn announcement_count(&self) -> u64 {
        u64::from(self.announcements.len())
    }

    /// Writes the caller's meta-address. The caller pays the exact storage cost of the
    /// bytes added; any excess deposit (and storage freed by a shorter overwrite) is refunded.
    #[payable]
    pub fn register(&mut self, meta_address: String) {
        if !meta_address.starts_with(META_PREFIX) {
            env::panic_str("meta_address must start with 'perde:'");
        }
        if meta_address.len() > MAX_META_LEN {
            env::panic_str("meta_address must be at most 128 characters");
        }
        let account_id = env::predecessor_account_id();
        let deposit = env::attached_deposit();

        let before = env::storage_usage();
        self.directory
            .insert(account_id.clone(), meta_address.clone());
        self.directory.flush();
        let after = env::storage_usage();

        let byte_cost = env::storage_byte_cost();
        let refund = if after >= before {
            let cost = byte_cost.saturating_mul(u128::from(after - before));
            if deposit < cost {
                env::panic_str(&format!(
                    "attached deposit must be at least {} yoctoNEAR to cover storage",
                    cost.as_yoctonear()
                ));
            }
            deposit.saturating_sub(cost)
        } else {
            deposit.saturating_add(byte_cost.saturating_mul(u128::from(before - after)))
        };

        emit_event(
            "register",
            [
                near_sdk::serde_json::json!({ "account_id": account_id, "meta_address": meta_address }),
            ],
        );

        if !refund.is_zero() {
            Promise::new(account_id).transfer(refund).detach();
        }
    }

    /// Removes the caller's meta-address and refunds the storage it occupied.
    pub fn unregister(&mut self) {
        let account_id = env::predecessor_account_id();
        let before = env::storage_usage();
        if self.directory.remove(&account_id).is_none() {
            env::panic_str("account has no registered meta_address");
        }
        self.directory.flush();
        let after = env::storage_usage();
        let refund =
            env::storage_byte_cost().saturating_mul(u128::from(before.saturating_sub(after)));

        emit_event(
            "unregister",
            [near_sdk::serde_json::json!({ "account_id": account_id })],
        );

        if !refund.is_zero() {
            Promise::new(account_id).transfer(refund).detach();
        }
    }

    pub fn get_meta_address(&self, account_id: AccountId) -> Option<String> {
        self.directory.get(&account_id).cloned()
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            announce_fee: U128(ANNOUNCE_FEE.as_yoctonear()),
            min_amount: U128(MIN_AMOUNT.as_yoctonear()),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

#[cfg(test)]
mod tests;
