import os
import json
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
GOOGLE_DRIVE_JSON_STRING = os.getenv("GOOGLE_DRIVE_JSON")
GOOGLE_DRIVE_JSON = json.loads(GOOGLE_DRIVE_JSON_STRING)
GOOGLE_DRIVE_JSON = (Path(__file__).resolve().parent.parent / GOOGLE_DRIVE_JSON_STRING).resolve()
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
