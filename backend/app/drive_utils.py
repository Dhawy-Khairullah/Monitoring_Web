import os
import io
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from .config import GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_JSON

# Load service account credentials
SCOPES = ['https://www.googleapis.com/auth/drive']

credentials = service_account.Credentials.from_service_account_info(
    GOOGLE_DRIVE_JSON, scopes=SCOPES
)

def upload_file_to_drive(filename: str, file_data: bytes, mimetype: str = "image/jpeg") -> str:
    service = build('drive', 'v3', credentials=credentials)
    file_metadata = {'name': filename, 'parents': [GOOGLE_DRIVE_FOLDER_ID]}
    media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=mimetype)
    file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()

    service.permissions().create(
        fileId=file.get('id'), body={'type': 'anyone', 'role': 'reader'}
    ).execute()

    return f"https://drive.google.com/uc?id={file.get('id')}&export=view"
