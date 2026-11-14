# Perde contract — testnet smoke test

Run: 2026-11-14T00:18:59.159Z · contract [`perde-pay.testnet`](https://testnet.nearblocks.io/address/perde-pay.testnet) · deploy tx [2nnVFxqQKCWyzdTbNyTizjfiX7k4S4TWUGpK9VYW8L9S](https://testnet.nearblocks.io/txns/2nnVFxqQKCWyzdTbNyTizjfiX7k4S4TWUGpK9VYW8L9S) · wasm sha256 `6f9b7ebb58a4c40b21682118682df28653e312162c261a8358ce122a514b345d`

Command: `cd scripts/contract && npm run smoke` (sender = the deployer account from `.env`). All outputs below are real RPC responses, trimmed. No private keys are included.

## 1. `get_config` (view)
```json
{
  "announce_fee": "2000000000000000000000",
  "min_amount": "10000000000000000000000",
  "version": "1.0.0"
}
```
## 2. `register` (payable, 0.0025 NEAR attached)

Meta-address built from two random ed25519 public keys (smoke-test only, not a real wallet).

tx: https://testnet.nearblocks.io/txns/99x1JiHou4VSdciiZQnxNpS5GPxrJrX39E8912RHjQGG
total gas burnt: 2.777 Tgas
```json
{
  "logs": [
    "EVENT_JSON:{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"register\",\"data\":[{\"account_id\":\"perde-pay.testnet\",\"meta_address\":\"perde:QVmYJSfMdhbJyU9AA2iAL53hUhJ3mTSyHuzQuYprfaWtMQBk9akDLnfScTVEF8h3ArCB5rvnjGpphdg65jWBGuEsLkpjm\"}]}"
  ],
  "receipts": [
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "1.799 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    }
  ]
}
```
storage refund receipt created: true

## 3. `get_meta_address` (view)
```json
{
  "account_id": "perde-pay.testnet",
  "result": "perde:QVmYJSfMdhbJyU9AA2iAL53hUhJ3mTSyHuzQuYprfaWtMQBk9akDLnfScTVEF8h3ArCB5rvnjGpphdg65jWBGuEsLkpjm"
}
```
```json
{
  "account_id": "nobody-registered-this.testnet",
  "result": null
}
```
## 4. `send` (payable, 0.05 NEAR attached, 30 Tgas prepaid)

Stealth account = hex of a freshly generated ed25519 public key (the key was discarded; this is a smoke test).
```json
{
  "stealth_account_exists_before": false,
  "announcement_count_before": 4
}
```
tx: https://testnet.nearblocks.io/txns/DLuWidNANgNJFCxRDE7p7CxfRDA38EQz9ZBFLPksR9xy
returned index: 4
gas burnt — transaction (signer side): 0.308 Tgas; total incl. receipts: 10.657 Tgas
```json
{
  "logs": [
    "EVENT_JSON:{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"announce\",\"data\":[{\"index\":4,\"stealth_account\":\"cbfc39c9229c2012d8a017a3e9df68852b8aa2e9d66a3b6584f580d1afb0cdb8\",\"ephemeral_pk\":\"3e5699a0801e3909f16a52a84c6806a0e7b9dd6767ae3f705435b0072bf26e2d\",\"view_tag\":170,\"amount\":\"48000000000000000000000\",\"timestamp_ms\":1794615544821}]}"
  ],
  "receipts": [
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "2.377 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "cbfc39c9229c2012d8a017a3e9df68852b8aa2e9d66a3b6584f580d1afb0cdb8",
      "gas_burnt": "7.525 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    }
  ]
}
```

## 5. `announcement_count` / `get_announcements` (view)
```json
{
  "announcement_count": 5,
  "get_announcements({from_index:4, limit:200})": [
    {
      "index": 4,
      "stealth_account": "cbfc39c9229c2012d8a017a3e9df68852b8aa2e9d66a3b6584f580d1afb0cdb8",
      "ephemeral_pk": "3e5699a0801e3909f16a52a84c6806a0e7b9dd6767ae3f705435b0072bf26e2d",
      "view_tag": 170,
      "amount": "48000000000000000000000",
      "timestamp_ms": 1794615544821
    }
  ]
}
```
## 6. `view_account` of the stealth account (funds arrived)
```json
{
  "account_id": "cbfc39c9229c2012d8a017a3e9df68852b8aa2e9d66a3b6584f580d1afb0cdb8",
  "amount_yocto": "48000000000000000000000",
  "amount_near": "0.048",
  "storage_usage": 182,
  "code_hash": "11111111111111111111111111111111"
}
```
explorer: https://testnet.nearblocks.io/address/cbfc39c9229c2012d8a017a3e9df68852b8aa2e9d66a3b6584f580d1afb0cdb8

Contract storage_usage: 141821 -> 141955 bytes (+134 bytes for this announcement = 0.00134 NEAR staked, vs announce_fee 0.002 NEAR).

## 7. Rejected `send` (view_tag = 256) — deposit is refunded by the protocol
tx: https://testnet.nearblocks.io/txns/BrxrPyR1fpoM6Cmh7tt4y5AG5pehpxmS6YTUpYze7ZT4
```json
{
  "failure": {
    "ActionError": {
      "index": 0,
      "kind": {
        "FunctionCallError": {
          "ExecutionError": "Smart contract panicked: view_tag must be in 0..=255"
        }
      }
    }
  },
  "receipts": [
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "1.152 Tgas",
      "status": "Failure"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    }
  ]
}
```
announcement_count after rejected send: 5 (unchanged)

## 8. `unregister` then `register` again
unregister tx: https://testnet.nearblocks.io/txns/8yggxFgAgdjCCA1CwrvSZkU6TisniDxQ3gwvg3ndtjH8
```json
{
  "logs": [
    "EVENT_JSON:{\"standard\":\"perde\",\"version\":\"1.0.0\",\"event\":\"unregister\",\"data\":[{\"account_id\":\"perde-pay.testnet\"}]}"
  ],
  "receipts": [
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "1.712 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    },
    {
      "executor": "perde-pay.testnet",
      "gas_burnt": "0.223 Tgas",
      "status": "SuccessValue"
    }
  ],
  "get_meta_address_after": null
}
```
register tx: https://testnet.nearblocks.io/txns/CmS44aG75Cnkz11285wdW7VXoRA4cGEtqX7QtXPeWUCJ
get_meta_address after re-register: `perde:QVmYJSfMdhbJyU9AA2iAL53hUhJ3mTSyHuzQuYprfaWtMQBk9akDLnfScTVEF8h3ArCB5rvnjGpphdg65jWBGuEsLkpjm`

## Summary

| Item | Value |
| --- | --- |
| contract | `perde-pay.testnet` |
| send tx | [DLuWidNANgNJFCxRDE7p7CxfRDA38EQz9ZBFLPksR9xy](https://testnet.nearblocks.io/txns/DLuWidNANgNJFCxRDE7p7CxfRDA38EQz9ZBFLPksR9xy) |
| send gas burnt (total) | 10.657 Tgas (prepaid 30 Tgas) |
| register gas burnt (total) | 2.777 Tgas |
| storage per announcement (on chain) | 134 bytes = 0.00134 NEAR |
| stealth account received | 0.048 NEAR |
