#!/usr/bin/env python3
"""Solve 0807.st anonymous proof-of-work and print curl form fields as JSON.

GET /pow → {id, ts, bits, sig, ttl}
Find nonce so sha256(id + "." + nonce) has `bits` leading zero bits.
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.request


POW_URL = "https://0807.st/pow"


def solve(pow_id: str, bits: int) -> str:
    prefix = f"{pow_id}.".encode()
    nonce = 0
    shift = 256 - int(bits)
    while True:
        digest = hashlib.sha256(prefix + str(nonce).encode()).digest()
        if int.from_bytes(digest, "big") >> shift == 0:
            return str(nonce)
        nonce += 1


def main() -> int:
    try:
        with urllib.request.urlopen(POW_URL, timeout=20) as resp:
            chal = json.loads(resp.read().decode())
    except Exception as exc:
        print(f"pow fetch failed: {exc}", file=sys.stderr)
        return 1

    try:
        nonce = solve(str(chal["id"]), int(chal["bits"]))
    except Exception as exc:
        print(f"pow solve failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({
        "pow_id": str(chal["id"]),
        "pow_ts": str(chal["ts"]),
        "pow_bits": str(chal["bits"]),
        "pow_sig": str(chal["sig"]),
        "pow_nonce": nonce,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
