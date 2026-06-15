import os, json
from google.oauth2 import service_account
from googleapiclient.discovery import build

FOLDER_ID = os.environ['GDRIVE_SHARED_FOLDER_ID']
ADMIN_KEY_PATH = os.environ['GCP_ADMIN_KEY_PATH']

def main():
    creds = service_account.Credentials.from_service_account_file(ADMIN_KEY_PATH, scopes=['https://www.googleapis.com/auth/drive'])
    service = build('drive', 'v3', credentials=creds)

    for filename in os.listdir('sa_keys'):
        if filename.endswith('.json'):
            with open(f'sa_keys/{filename}', 'r') as f:
                sa_email = json.load(f)['client_email']
            permission = {'type': 'user', 'role': 'organizer', 'emailAddress': sa_email}
            try:
                service.permissions().create(fileId=FOLDER_ID, body=permission, supportsAllDrives=True).execute()
                print(f"Integrated: {sa_email}")
            except Exception as e:
                print(f"Failed: {e}")

if __name__ == '__main__':
    main()
