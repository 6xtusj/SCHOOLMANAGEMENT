"""Download a private S3-compatible school upload bucket to a local backup.

Usage: python backup_object_storage.py [output-directory]
Configure S3_BUCKET, S3_ENDPOINT_URL, S3_REGION, S3_ACCESS_KEY_ID,
S3_SECRET_ACCESS_KEY and S3_PREFIX in the environment.
Copy the resulting backup directory to a separate, protected location.
"""
import hashlib, json, os, sys
from datetime import datetime, timezone
from pathlib import Path
import boto3

required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
missing = [key for key in required if not os.environ.get(key, "").strip()]
if missing:
    raise SystemExit("Missing storage settings: " + ", ".join(missing))
client = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
    region_name=os.environ.get("S3_REGION", "auto"),
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
)
bucket = os.environ["S3_BUCKET"]
prefix = os.environ.get("S3_PREFIX", "school-uploads").strip("/")
root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path("backups").resolve()
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
destination = root / f"school_uploads_{stamp}"
destination.mkdir(parents=True, exist_ok=False)
manifest = []
paginator = client.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=bucket, Prefix=(prefix + "/") if prefix else ""):
    for item in page.get("Contents", []):
        key = item["Key"]
        relative = key[len(prefix)+1:] if prefix and key.startswith(prefix + "/") else key
        if not relative or relative.endswith("/"):
            continue
        target = (destination / relative).resolve()
        if destination not in target.parents:
            raise SystemExit("Unsafe object key encountered; backup stopped.")
        target.parent.mkdir(parents=True, exist_ok=True)
        response = client.get_object(Bucket=bucket, Key=key)
        payload = response["Body"].read()
        target.write_bytes(payload)
        manifest.append({"key": key, "file": relative, "size": len(payload),
                         "sha256": hashlib.sha256(payload).hexdigest()})
(destination / "manifest.json").write_text(json.dumps({
    "bucket": bucket, "prefix": prefix, "created_at": stamp,
    "object_count": len(manifest), "objects": manifest
}, indent=2), encoding="utf-8")
print(destination)
