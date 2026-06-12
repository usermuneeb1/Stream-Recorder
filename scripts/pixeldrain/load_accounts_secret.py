#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🟣 Pixeldrain — Push Active API Key to GitHub Secret                       ║
# ║  Picks the healthiest account from accounts.csv (valid key, lowest usage)   ║
# ║  and writes its API key into the repo secret PIXELDRAIN_API_KEY using the   ║
# ║  GitHub REST API. This lets the existing upload pipeline rotate accounts    ║
# ║  automatically without committing keys anywhere else.                       ║
# ║                                                                            ║
# ║  Env required: GH_PAT, GITHUB_REPOSITORY (owner/repo)                       ║
# ║  Optional:     SECRET_NAME (default PIXELDRAIN_API_KEY)                     ║
# ║  pip install: requests pynacl                                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import base64
import csv
import os
import sys

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "accounts.csv")
API = "https://pixeldrain.com/api"


def valid_key(api_key):
    try:
        token = base64.b64encode(f":{api_key}".encode()).decode()
        r = requests.get(f"{API}/user", headers={"Authorization": f"Basic {token}"}, timeout=20)
        if r.status_code == 200:
            return r.json().get("storage_space_used", 0)
    except Exception:
        pass
    return None


def pick_best():
    if not os.path.exists(CSV_FILE):
        return None
    with open(CSV_FILE, newline="") as f:
        rows = list(csv.DictReader(f))
    best = None
    best_used = None
    for row in rows:
        key = (row.get("API Key") or "").strip()
        if not key:
            continue
        used = valid_key(key)
        if used is None:
            continue
        if best is None or used < best_used:
            best, best_used = row, used
    return best


def set_secret(owner_repo, secret_name, secret_value, gh_pat):
    from nacl import encoding, public  # pip install pynacl

    h = {"Authorization": f"Bearer {gh_pat}", "Accept": "application/vnd.github+json"}
    pk = requests.get(f"https://api.github.com/repos/{owner_repo}/actions/secrets/public-key", headers=h, timeout=20)
    pk.raise_for_status()
    pk = pk.json()

    pub = public.PublicKey(pk["key"].encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pub).encrypt(secret_value.encode())
    enc = base64.b64encode(sealed).decode()

    r = requests.put(
        f"https://api.github.com/repos/{owner_repo}/actions/secrets/{secret_name}",
        headers=h,
        json={"encrypted_value": enc, "key_id": pk["key_id"]},
        timeout=20,
    )
    r.raise_for_status()
    return r.status_code


def main():
    gh_pat = os.environ.get("GH_PAT", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    secret_name = os.environ.get("SECRET_NAME", "PIXELDRAIN_API_KEY").strip()

    if not gh_pat or not repo:
        print("ℹ️ GH_PAT/GITHUB_REPOSITORY not set — skipping secret update")
        return 0

    best = pick_best()
    if not best:
        print("❌ No valid Pixeldrain account found in accounts.csv")
        return 1

    key = best["API Key"].strip()
    try:
        code = set_secret(repo, secret_name, key, gh_pat)
        print(f"✅ {secret_name} updated from account {best.get('Email')} (HTTP {code})")
        return 0
    except Exception as e:
        print(f"❌ Failed to set secret: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
