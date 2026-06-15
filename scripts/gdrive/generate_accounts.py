#!/usr/bin/env python3
import base64, json, os, sys, time

ACCOUNTS_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "accounts.csv")
SA_KEYS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sa_keys")
PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()

def log(m): print(m, flush=True)

def get_creds():
    from google.oauth2 import service_account
    raw = os.environ.get("GCP_ADMIN_KEY", "").strip()
    if not raw:
        log("ERROR: GCP_ADMIN_KEY not set"); return None
    decoded = base64.b64decode(raw).decode("utf-8")
    return service_account.Credentials.from_service_account_info(
        json.loads(decoded),
        scopes=["https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/drive",
                "https://www.googleapis.com/auth/iam"]
    )

def generate_sa(count):
    creds = get_creds()
    if not creds or not PROJECT_ID:
        log("ERROR: GCP_PROJECT_ID not set"); return 0
    from googleapiclient.discovery import build
    iam = build("iam", "v1", credentials=creds)
    os.makedirs(SA_KEYS_DIR, exist_ok=True)

    existing = set()
    if os.path.exists(ACCOUNTS_CSV):
        with open(ACCOUNTS_CSV) as f:
            for line in f:
                parts = line.strip().split(",")
                if len(parts) >= 2: existing.add(parts[1])

    created = 0
    for i in range(count):
        sa_name = f"gdrive-sa-{int(time.time())}-{i}"
        sa_email = f"{sa_name}@{PROJECT_ID}.iam.gserviceaccount.com"
        if sa_email in existing:
            log(f"  skip: {sa_email}")
            continue
        try:
            iam.projects().serviceAccounts().create(
                name=f"projects/{PROJECT_ID}",
                body={"accountId": sa_name, "serviceAccount": {"displayName": f"GDrive {i+1}"}}
            ).execute()
            log(f"  created: {sa_email}")
        except Exception as e:
            log(f"  FAIL create: {e}")
            continue
        try:
            key = iam.projects().serviceAccounts().keys().create(
                name=f"projects/{PROJECT_ID}/serviceAccounts/{sa_email}",
                body={"keyAlgorithm": "KEY_ALG_RSA_2048", "privateKeyType": "TYPE_GOOGLE_CREDENTIALS_FILE"}
            ).execute()
            key_data = json.loads(base64.b64decode(key["privateKeyData"]).decode())
            with open(os.path.join(SA_KEYS_DIR, f"{sa_name}.json"), "w") as f:
                json.dump(key_data, f, indent=2)
        except Exception as e:
            log(f"  FAIL key: {e}")
            continue
        with open(ACCOUNTS_CSV, "a") as f:
            f.write(f"{sa_name},{sa_email},{os.path.join(SA_KEYS_DIR, f'{sa_name}.json')}\n")
        created += 1
        time.sleep(1)
    log(f"Created {created} new SA(s)")
    return created

def integrate_sa():
    creds = get_creds()
    if not creds: return 0
    folder_id = os.environ.get("GDRIVE_FOLDER_ID", "").strip()
    if not folder_id:
        log("ERROR: GDRIVE_FOLDER_ID not set"); return 0
    from googleapiclient.discovery import build
    drive = build("drive", "v3", credentials=creds)
    ok = 0
    seen = set()
    if os.path.isdir(SA_KEYS_DIR):
        for fn in sorted(os.listdir(SA_KEYS_DIR)):
            if not fn.endswith(".json"): continue
            with open(os.path.join(SA_KEYS_DIR, fn)) as f:
                sa_email = json.load(f)["client_email"]
            if sa_email in seen: continue
            seen.add(sa_email)
            try:
                drive.permissions().create(
                    fileId=folder_id,
                    body={"type": "user", "role": "organizer", "emailAddress": sa_email},
                    supportsAllDrives=True
                ).execute()
                log(f"  OK: {sa_email}")
                ok += 1
            except Exception as e:
                log(f"  FAIL: {sa_email} -> {e}")
    log(f"Integrated {ok} SA(s)")
    return ok

def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "both"
    if action in ("generate","both"):
        count = int(os.environ.get("GDRIVE_SA_COUNT","5"))
        generate_sa(count)
    if action in ("integrate","both","integrate-only"):
        integrate_sa()

if __name__ == "__main__":
    main()
