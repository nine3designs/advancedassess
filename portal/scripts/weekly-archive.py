#!/usr/bin/env python3
"""Weekly tidy-up: archive completed board cards for every portal client.

Runs from GitHub Actions (see .github/workflows/weekly-archive.yml).
Completed cards are never deleted - their ids are added to
clients.portal_prefs.archived_ids, which hides them from the portal board
and lists them in the "Archived" panel instead.
"""
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REST = f"{SUPABASE_URL}/rest/v1"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Accept-Encoding": "identity",
    "Prefer": "return=representation",
}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(REST + path, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode() or "[]"
    return json.loads(raw)


def main():
    today = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    clients = call("GET", "/clients?select=id,name,portal_prefs")
    total_archived = 0
    touched = 0

    for client in clients:
        cid = client["id"]
        prefs = client.get("portal_prefs") or {}
        archived = [str(x) for x in (prefs.get("archived_ids") or [])]
        if str(prefs.get("last_archive") or "") == today:
            print(f"skip {client.get('name')} - already archived today")
            continue

        done = call("GET", f"/board_cards?client_id=eq.{cid}&status=eq.done&select=id,title")
        ids = [str(row["id"]) for row in done]
        new_ids = [i for i in ids if i not in set(archived)]
        merged = archived + new_ids

        prefs_out = dict(prefs)
        prefs_out["archived_ids"] = merged
        prefs_out["last_archive"] = today
        call("PATCH", f"/clients?id=eq.{cid}", {"portal_prefs": prefs_out})

        touched += 1
        if new_ids:
            total_archived += len(new_ids)
            call("POST", "/activity_log", {
                "client_id": cid,
                "actor": "system",
                "message": f"archived {len(new_ids)} completed task{'s' if len(new_ids) != 1 else ''} (weekly Friday tidy-up)",
            })
        print(f"ok {client.get('name')} - archived {len(new_ids)}, total archived {len(merged)}")

    print(f"DONE {today} - clients updated: {touched}, tasks archived: {total_archived}")


if __name__ == "__main__":
    main()
