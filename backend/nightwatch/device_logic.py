"""Dependency-free device token and retry identity helpers."""
import hashlib
import json
import secrets

def new_device_token():
    return 'nw_device_' + secrets.token_urlsafe(32)

def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def event_key(payload):
    return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
