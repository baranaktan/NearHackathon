use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::testing_env;

const STEALTH: &str = "3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29";
const EPHEMERAL: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const ONE_YOCTO_PER_BYTE: u128 = 10_000_000_000_000_000_000; // storage_byte_cost (1e19)

fn alice() -> AccountId {
    "alice.testnet".parse().unwrap()
}

fn bob() -> AccountId {
    "bob.testnet".parse().unwrap()
}

fn set_ctx(predecessor: AccountId, deposit: NearToken) {
    let ctx = VMContextBuilder::new()
        .current_account_id("perde.testnet".parse().unwrap())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .block_timestamp(1_763_000_000_123_456_789)
        .build();
    testing_env!(ctx);
}

fn min_deposit() -> NearToken {
    ANNOUNCE_FEE.saturating_add(MIN_AMOUNT)
}

/// Returns (receiver, deposit) for every Transfer action created so far in this context.
fn transfers() -> Vec<(AccountId, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let receiver = r.receiver_id.clone();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::Transfer { deposit, .. } => {
                    Some((receiver.clone(), deposit.as_yoctonear()))
                }
                _ => None,
            })
        })
        .collect()
}

fn hex_index(i: u64) -> String {
    format!("{:064x}", i)
}

fn meta(len: usize) -> String {
    let mut s = String::from(META_PREFIX);
    while s.len() < len {
        s.push('x');
    }
    s
}

// ---------------------------------------------------------------- send

#[test]
fn send_happy_path_records_transfers_and_emits_event() {
    set_ctx(alice(), NearToken::from_millinear(50));
    let mut c = Perde::default();
    let idx = c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 171);
    assert_eq!(idx, 0);
    assert_eq!(c.announcement_count(), 1);

    let expected_amount = NearToken::from_millinear(48).as_yoctonear();
    assert_eq!(
        transfers(),
        vec![(STEALTH.parse().unwrap(), expected_amount)]
    );

    let page = c.get_announcements(0, 10);
    assert_eq!(
        page,
        vec![AnnouncementView {
            index: 0,
            stealth_account: STEALTH.to_string(),
            ephemeral_pk: EPHEMERAL.to_string(),
            view_tag: 171,
            amount: U128(expected_amount),
            timestamp_ms: 1_763_000_000_123,
        }]
    );

    let logs = get_logs();
    assert_eq!(logs.len(), 1);
    let expected_event = format!(
        "EVENT_JSON:{{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"announce\",\"data\":[{{\"index\":0,\"stealth_account\":\"{STEALTH}\",\"ephemeral_pk\":\"{EPHEMERAL}\",\"view_tag\":171,\"amount\":\"{expected_amount}\",\"timestamp_ms\":1763000000123}}]}}"
    );
    assert_eq!(logs[0], expected_event);
}

#[test]
fn send_returns_sequential_indices() {
    set_ctx(alice(), min_deposit());
    let mut c = Perde::default();
    for i in 0..3u64 {
        assert_eq!(c.send(hex_index(i), EPHEMERAL.to_string(), 0), i);
    }
    assert_eq!(c.announcement_count(), 3);
}

#[test]
fn send_fee_math_at_exact_minimum() {
    set_ctx(alice(), min_deposit());
    let mut c = Perde::default();
    c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 255);
    assert_eq!(
        transfers(),
        vec![(STEALTH.parse().unwrap(), MIN_AMOUNT.as_yoctonear())]
    );
    assert_eq!(
        c.get_announcements(0, 1)[0].amount,
        U128(MIN_AMOUNT.as_yoctonear())
    );
    assert_eq!(c.get_announcements(0, 1)[0].view_tag, 255);
}

#[test]
fn send_fee_math_large_amount() {
    let deposit = NearToken::from_near(1_000);
    set_ctx(alice(), deposit);
    let mut c = Perde::default();
    c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 7);
    let expected = deposit.as_yoctonear() - ANNOUNCE_FEE.as_yoctonear();
    assert_eq!(transfers(), vec![(STEALTH.parse().unwrap(), expected)]);
}

#[test]
#[should_panic(expected = "attached deposit must be at least 12000000000000000000000 yoctoNEAR")]
fn send_rejects_deposit_one_yocto_below_minimum() {
    set_ctx(
        alice(),
        NearToken::from_yoctonear(min_deposit().as_yoctonear() - 1),
    );
    Perde::default().send(STEALTH.to_string(), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "attached deposit must be at least")]
fn send_rejects_zero_deposit() {
    set_ctx(alice(), NearToken::from_yoctonear(0));
    Perde::default().send(STEALTH.to_string(), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_uppercase_stealth() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(STEALTH.to_uppercase(), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_short_stealth() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(STEALTH[..62].to_string(), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_long_stealth() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(format!("{STEALTH}00"), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_named_account_as_stealth() {
    set_ctx(alice(), min_deposit());
    Perde::default().send("bob.testnet".to_string(), EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_non_hex_stealth() {
    set_ctx(alice(), min_deposit());
    let bad = format!("{}g", &STEALTH[..63]);
    Perde::default().send(bad, EPHEMERAL.to_string(), 1);
}

#[test]
#[should_panic(expected = "stealth_account must be exactly 64 lowercase hex characters")]
fn send_rejects_eth_implicit_stealth() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(
        "0x1234567890abcdef1234567890abcdef12345678".to_string(),
        EPHEMERAL.to_string(),
        1,
    );
}

#[test]
#[should_panic(expected = "ephemeral_pk must be exactly 64 lowercase hex characters")]
fn send_rejects_bad_ephemeral_length() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(STEALTH.to_string(), EPHEMERAL[..63].to_string(), 1);
}

#[test]
#[should_panic(expected = "ephemeral_pk must be exactly 64 lowercase hex characters")]
fn send_rejects_uppercase_ephemeral() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(STEALTH.to_string(), EPHEMERAL.to_uppercase(), 1);
}

#[test]
#[should_panic(expected = "view_tag must be in 0..=255")]
fn send_rejects_view_tag_256() {
    set_ctx(alice(), min_deposit());
    Perde::default().send(STEALTH.to_string(), EPHEMERAL.to_string(), 256);
}

#[test]
fn failed_send_validation_does_not_change_state() {
    set_ctx(alice(), min_deposit());
    let mut c = Perde::default();
    c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 1);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 300);
    }));
    assert!(result.is_err());
    assert_eq!(c.announcement_count(), 1);
}

#[test]
fn announce_fee_covers_storage_of_one_announcement() {
    set_ctx(alice(), min_deposit());
    let mut c = Perde::default();
    // First write may include one-time collection overhead; measure a steady-state append.
    c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 1);
    c.announcements.flush();
    let before = env::storage_usage();
    c.send(STEALTH.to_string(), EPHEMERAL.to_string(), 2);
    c.announcements.flush();
    let bytes = env::storage_usage() - before;
    // key: 1 (prefix) + 4 (u32 index); value: 32 + 32 + 1 + 16 + 8 = 89; record overhead: 40
    assert_eq!(bytes, 134);
    let cost = u128::from(bytes) * env::storage_byte_cost().as_yoctonear();
    assert_eq!(env::storage_byte_cost().as_yoctonear(), ONE_YOCTO_PER_BYTE);
    assert!(cost <= ANNOUNCE_FEE.as_yoctonear());
    assert_eq!(
        ANNOUNCE_FEE.as_yoctonear() - cost,
        660_000_000_000_000_000_000
    );
}

// ---------------------------------------------------------------- pagination

fn contract_with(n: u64) -> Perde {
    set_ctx(alice(), min_deposit());
    let mut c = Perde::default();
    for i in 0..n {
        // Each real call has its own 16 KiB log budget; mirror that by resetting the context.
        if i % 20 == 0 {
            set_ctx(alice(), min_deposit());
        }
        c.send(hex_index(i), EPHEMERAL.to_string(), (i % 256) as u16);
    }
    c
}

fn indices(v: &[AnnouncementView]) -> Vec<u64> {
    v.iter().map(|a| a.index).collect()
}

#[test]
fn pagination_boundaries() {
    let c = contract_with(5);
    assert_eq!(indices(&c.get_announcements(0, 2)), vec![0, 1]);
    assert_eq!(indices(&c.get_announcements(2, 2)), vec![2, 3]);
    assert_eq!(indices(&c.get_announcements(3, 10)), vec![3, 4]);
    assert_eq!(indices(&c.get_announcements(4, 1)), vec![4]);
    assert!(c.get_announcements(5, 1).is_empty());
    assert!(c.get_announcements(100, 10).is_empty());
    assert!(c.get_announcements(0, 0).is_empty());
    assert!(c.get_announcements(u64::MAX, u64::MAX).is_empty());
    assert_eq!(indices(&c.get_announcements(1, u64::MAX)), vec![1, 2, 3, 4]);
    let all = c.get_announcements(0, 5);
    assert_eq!(all[3].stealth_account, hex_index(3));
    assert_eq!(all[3].view_tag, 3);
}

#[test]
fn pagination_on_empty_log() {
    set_ctx(alice(), NearToken::from_yoctonear(0));
    let c = Perde::default();
    assert_eq!(c.announcement_count(), 0);
    assert!(c.get_announcements(0, 200).is_empty());
}

#[test]
fn pagination_caps_limit_at_200() {
    let c = contract_with(205);
    let page = c.get_announcements(0, 1_000);
    assert_eq!(page.len(), 200);
    assert_eq!(page.first().unwrap().index, 0);
    assert_eq!(page.last().unwrap().index, 199);
    assert_eq!(
        indices(&c.get_announcements(200, 200)),
        vec![200, 201, 202, 203, 204]
    );
    assert_eq!(c.get_announcements(1, 201).len(), 200);
}

// ---------------------------------------------------------------- config

#[test]
fn config_values() {
    set_ctx(alice(), NearToken::from_yoctonear(0));
    let c = Perde::default();
    let cfg = c.get_config();
    assert_eq!(cfg.announce_fee, U128(2_000_000_000_000_000_000_000));
    assert_eq!(cfg.min_amount, U128(10_000_000_000_000_000_000_000));
    assert_eq!(cfg.version, "1.0.0");
    let json = near_sdk::serde_json::to_string(&cfg).unwrap();
    assert_eq!(
        json,
        "{\"announce_fee\":\"2000000000000000000000\",\"min_amount\":\"10000000000000000000000\",\"version\":\"1.0.0\"}"
    );
}

// ---------------------------------------------------------------- directory

/// Exact storage bytes of one directory entry for `account` with a meta-address of `meta_len`.
fn entry_bytes(account: &AccountId, meta_len: usize) -> u128 {
    // key: 1 (prefix) + 4 + len(account); value: 4 + len(meta); record overhead: 40
    (1 + 4 + account.as_str().len() + 4 + meta_len + 40) as u128
}

#[test]
fn register_charges_exact_storage_and_refunds_excess() {
    let deposit = NearToken::from_millinear(10);
    set_ctx(alice(), deposit);
    let mut c = Perde::default();
    let m = meta(99);
    let before = env::storage_usage();
    c.register(m.clone());
    let used = u128::from(env::storage_usage() - before);
    assert_eq!(used, entry_bytes(&alice(), 99));
    assert_eq!(c.get_meta_address(alice()), Some(m.clone()));
    assert_eq!(c.get_meta_address(bob()), None);
    let refund = deposit.as_yoctonear() - used * ONE_YOCTO_PER_BYTE;
    assert_eq!(transfers(), vec![(alice(), refund)]);
    let logs = get_logs();
    assert_eq!(
        logs,
        vec![format!(
            "EVENT_JSON:{{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"register\",\"data\":[{{\"account_id\":\"alice.testnet\",\"meta_address\":\"{m}\"}}]}}"
        )]
    );
}

#[test]
fn register_with_exact_deposit_has_no_refund() {
    let exact = entry_bytes(&alice(), 99) * ONE_YOCTO_PER_BYTE;
    set_ctx(alice(), NearToken::from_yoctonear(exact));
    let mut c = Perde::default();
    c.register(meta(99));
    assert!(transfers().is_empty());
}

#[test]
#[should_panic(expected = "to cover storage")]
fn register_rejects_insufficient_deposit() {
    let exact = entry_bytes(&alice(), 99) * ONE_YOCTO_PER_BYTE;
    set_ctx(alice(), NearToken::from_yoctonear(exact - 1));
    Perde::default().register(meta(99));
}

#[test]
#[should_panic(expected = "meta_address must start with 'perde:'")]
fn register_rejects_wrong_prefix() {
    set_ctx(alice(), NearToken::from_millinear(10));
    Perde::default().register("stealth:abc".to_string());
}

#[test]
#[should_panic(expected = "meta_address must be at most 128 characters")]
fn register_rejects_129_chars() {
    set_ctx(alice(), NearToken::from_millinear(10));
    Perde::default().register(meta(129));
}

#[test]
fn register_accepts_128_chars() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(128));
    assert_eq!(c.get_meta_address(alice()).unwrap().len(), 128);
}

#[test]
fn register_overwrite_longer_charges_only_difference() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(50));
    let deposit = NearToken::from_millinear(1);
    set_ctx(alice(), deposit);
    let before = env::storage_usage();
    c.register(meta(80));
    assert_eq!(env::storage_usage() - before, 30);
    assert_eq!(c.get_meta_address(alice()), Some(meta(80)));
    assert_eq!(
        transfers(),
        vec![(alice(), deposit.as_yoctonear() - 30 * ONE_YOCTO_PER_BYTE)]
    );
}

#[test]
#[should_panic(expected = "attached deposit must be at least 300000000000000000000 yoctoNEAR")]
fn register_overwrite_longer_requires_deposit_for_difference() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(50));
    set_ctx(alice(), NearToken::from_yoctonear(0));
    c.register(meta(80));
}

#[test]
fn register_overwrite_shorter_refunds_freed_storage() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(100));
    set_ctx(alice(), NearToken::from_yoctonear(0));
    let before = env::storage_usage();
    c.register(meta(60));
    assert_eq!(before - env::storage_usage(), 40);
    assert_eq!(transfers(), vec![(alice(), 40 * ONE_YOCTO_PER_BYTE)]);
    assert_eq!(c.get_meta_address(alice()), Some(meta(60)));
}

#[test]
fn register_overwrite_same_length_refunds_whole_deposit() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(70));
    set_ctx(alice(), NearToken::from_millinear(3));
    c.register(format!("{}y", &meta(70)[..69]));
    assert_eq!(
        transfers(),
        vec![(alice(), NearToken::from_millinear(3).as_yoctonear())]
    );
}

#[test]
fn unregister_refunds_exactly_what_was_paid() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(99));
    let paid = entry_bytes(&alice(), 99) * ONE_YOCTO_PER_BYTE;

    // testing_env! resets the storage_usage counter, so measure the delta inside one context.
    set_ctx(alice(), NearToken::from_yoctonear(0));
    let before = env::storage_usage();
    c.unregister();
    assert_eq!(
        u128::from(before - env::storage_usage()),
        entry_bytes(&alice(), 99)
    );
    assert_eq!(c.get_meta_address(alice()), None);
    assert_eq!(transfers(), vec![(alice(), paid)]);
    assert_eq!(
        get_logs(),
        vec!["EVENT_JSON:{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"unregister\",\"data\":[{\"account_id\":\"alice.testnet\"}]}".to_string()]
    );
}

#[test]
fn unregister_after_overwrites_refunds_net_storage() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(40));
    set_ctx(alice(), NearToken::from_millinear(10));
    c.register(meta(120));
    set_ctx(alice(), NearToken::from_yoctonear(0));
    c.register(meta(90));
    set_ctx(alice(), NearToken::from_yoctonear(0));
    c.unregister();
    assert_eq!(
        transfers(),
        vec![(alice(), entry_bytes(&alice(), 90) * ONE_YOCTO_PER_BYTE)]
    );
}

#[test]
fn unregister_only_affects_caller() {
    set_ctx(alice(), NearToken::from_millinear(10));
    let mut c = Perde::default();
    c.register(meta(30));
    set_ctx(bob(), NearToken::from_millinear(10));
    c.register(meta(31));
    set_ctx(bob(), NearToken::from_yoctonear(0));
    c.unregister();
    assert_eq!(c.get_meta_address(alice()), Some(meta(30)));
    assert_eq!(c.get_meta_address(bob()), None);
}

#[test]
#[should_panic(expected = "account has no registered meta_address")]
fn unregister_without_registration_panics() {
    set_ctx(alice(), NearToken::from_yoctonear(0));
    Perde::default().unregister();
}

// ---------------------------------------------------------------- helpers

#[test]
fn hex_roundtrip() {
    let bytes = parse_hex32(STEALTH, "x");
    assert_eq!(to_hex(&bytes), STEALTH);
    assert_eq!(parse_hex32(&hex_index(255), "x")[31], 255);
}
