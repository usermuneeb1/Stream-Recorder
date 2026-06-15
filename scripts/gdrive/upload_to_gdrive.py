#!/usr/bin/env python3
import base64, json, os, sys, time

def log(m): print(m, flush=True)

def upload(file_path: str) -> dict:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    raw_key = os.environ.get("GDRIVE_SA_KEY", "").strip()
    folder_id = os.environ.get("GDRIVE_FOLDER_ID", "").strip()
    if not raw_key or not folder_id:
        log("ERROR: GDRIVE_SA_KEY or GDRIVE_FOLDER_ID not set")
        return {}

    decoded = base64.b64decode(raw_key).decode("utf-8")
    creds = service_account.Credentials.from_service_account_info(
        json.loads(decoded), scopes=["https://www.googleapis.com/auth/drive"]
    )
    drive = build("drive", "v3", credentials=creds)
    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    log(f"Uploading: {file_name} ({file_size / 1024 / 1024:.1f} MB)")

    media = MediaFileUpload(file_path, chunksize=256*1024, resumable=True)
    body = {"name": file_name, "parents": [folder_id],
            "description": "Stream-Recorder GDrive backup"}

    try:
        request = drive.files().create(body=body, media_body=media,
            supportsAllDrives=True, fields="id,name,size,mimeType,webViewLink,webContentLink")
        response = None
        last = -1
        while response is None:
            status, response = request.next_chunk()
            if status:
                p = int(status.progress() * 100)
                if p != last and p % 10 == 0:
                    log(f"  {p}%")
                    last = p
        fid = response.get("id", "")
        log(f"OK! File ID: {fid}")
        return {"file_id": fid, "webViewLink": response.get("webViewLink",""),
                "webContentLink": response.get("webContentLink","")}
    except Exception as e:
        log(f"FAIL: {e}")
        return {}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 upload_to_gdrive.py <file.mp4>")
        sys.exit(1)
    r = upload(sys.argv[1])
    if r:
        print(f"\nDirect download: https://drive.google.com/uc?export=download&id={r['file_id']}")
        sys.exit(0)
    sys.exit(1)
