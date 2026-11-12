"""Restore a folder created by backup_object_storage.py to the configured bucket.

Restores only missing objects by default. Set RESTORE_OVERWRITE=true to replace
keys that already exist. Review manifest.json and test against a separate bucket.
"""
import hashlib, json, os, sys
from pathlib import Path
import boto3

if len(sys.argv) != 2:
    raise SystemExit("Usage: python restore_object_storage.py backup-folder")
root = Path(sys.argv[1]).resolve()
manifest_path = root / "manifest.json"
if not manifest_path.is_file():
    raise SystemExit("manifest.json is missing; this is not a recognised backup.")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
bucket = os.environ.get("S3_BUCKET", "").strip()
if not bucket:
    raise SystemExit("Set S3_BUCKET to the destination bucket.")
required = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
if any(not os.environ.get(key, "").strip() for key in required):
    raise SystemExit("Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.")
client = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
    region_name=os.environ.get("S3_REGION", "auto"),
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"])
overwrite = os.environ.get("RESTORE_OVERWRITE", "false").lower() == "true"
if input(f"Restore {len(manifest['objects'])} objects into bucket {bucket}? Type RESTORE: ") != "RESTORE":
    raise SystemExit("Restore cancelled.")
restored = 0
for item in manifest["objects"]:
    source = (root / item["file"]).resolve()
    if root not in source.parents or not source.is_file():
        raise SystemExit(f"Backup file missing or unsafe: {item['file']}")
    payload = source.read_bytes()
    if hashlib.sha256(payload).hexdigest() != item["sha256"]:
        raise SystemExit(f"Checksum mismatch: {item['file']}")
    key = item["key"]
    if not overwrite:
        try:
            client.head_object(Bucket=bucket, Key=key)
            continue
        except Exception as exc:
            code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if code not in ("404", "NoSuchKey", "NotFound"):
                raise
    client.put_object(Bucket=bucket, Key=key, Body=payload,
                      ContentType="application/octet-stream")
    restored += 1
print(f"Restore complete: {restored} object(s) written; existing keys were skipped unless overwrite was enabled.")
