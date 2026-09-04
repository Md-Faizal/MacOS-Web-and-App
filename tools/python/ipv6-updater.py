"""
Cloudflare Dynamic DNS Updater for Windows (IPv6)
Self-contained Python script to monitor IPv6 changes and update Cloudflare AAAA records.
Requirements: Python 3.6+, requests
"""

import requests
import time
import sys
import os
from datetime import datetime
import dotenv

# --- USER CONFIGURATION ---
ZONE_NAME = "faizal.uk"  # Your domain
API_TOKEN = "hhVlLzXlQOiFr64YTpszK0Sz2WY9XhUMVq-8kyxp"  # Cloudflare API Token (keep this secret!)
RECORD_NAMES = ["faizal.uk", "erp.faizal.uk", "mine.faizal.uk", "mac.faizal.uk"]  # Root, subdomains, and mac subdomain
CHECK_INTERVAL_SECONDS = 300  # Check for IPv6 changes every 5 minutes

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

# --- GET CURRENT PUBLIC IPV6 ---
def get_public_ipv6():
    try:
        ipv6 = requests.get("https://api64.ipify.org", timeout=10).text
        if ":" in ipv6:
            return ipv6
    except Exception:
        pass
    return None

# --- UPDATE DNS RECORDS ---
def update_dns_records(ipv6, zone_id):
    updated = False
    for record_name in RECORD_NAMES:
        try:
            # Get record ID
            url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?type=AAAA&name={record_name}"
            record = requests.get(url, headers=HEADERS).json()
            if not record.get("success") or not record.get("result"):
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] WARNING: Failed to find AAAA record for {record_name}.")
                continue
            rec = record["result"][0]
            record_id = rec["id"]
            current = rec["content"]
            proxied = rec["proxied"]

            # Check if update is needed
            if current == ipv6:
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] INFO: {record_name} already set to {ipv6}")
                continue

            # Update the record
            print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] UPDATING: {record_name} from {current} to {ipv6}")
            body = {
                "type": "AAAA",
                "name": record_name,
                "content": ipv6,
                "ttl": 1,
                "proxied": proxied
            }
            response = requests.put(
                f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}",
                headers=HEADERS,
                json=body
            ).json()
            if response.get("success"):
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] SUCCESS: Updated {record_name} AAAA to {ipv6}")
                updated = True
            else:
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: Failed to update {record_name} - {response.get('errors')}")
        except Exception as e:
            print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: Exception updating {record_name} - {e}")
    return updated

# --- GET ZONE ID ---
def get_zone_id():
    try:
        url = f"https://api.cloudflare.com/client/v4/zones?name={ZONE_NAME}"
        zone = requests.get(url, headers=HEADERS).json()
        if not zone.get("success") or not zone.get("result"):
            print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: Failed to get zone ID. Check your API token.")
            return None
        zone_id = zone["result"][0]["id"]
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Zone ID obtained: {zone_id}")
        return zone_id
    except Exception as e:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: API request failed - {e}")
        return None

# --- MAIN LOOP ---
def main():
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] IPv6 Updater Service Starting...")
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Check interval: {CHECK_INTERVAL_SECONDS} seconds")
    last_ipv6 = get_public_ipv6()
    if not last_ipv6:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: Could not determine public IPv6 address. Retrying...")
        time.sleep(5)
        last_ipv6 = get_public_ipv6()
    if not last_ipv6:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: Failed to get IPv6 after retry. Exiting.")
        sys.exit(1)
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Current public IPv6: {last_ipv6}")
    zone_id = get_zone_id()
    if not zone_id:
        sys.exit(1)
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Performing initial update...")
    updated = update_dns_records(last_ipv6, zone_id)
    if updated:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Initial update complete. Entering monitoring mode...")
    else:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] All records already synced. Entering monitoring mode...")
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Monitoring for IPv6 changes (Press Ctrl+C to stop)...")
    while True:
        try:
            time.sleep(CHECK_INTERVAL_SECONDS)
            current_ipv6 = get_public_ipv6()
            if not current_ipv6:
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] WARNING: Could not determine current IPv6. Will retry in next cycle.")
                continue
            if current_ipv6 != last_ipv6:
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] NETWORK CHANGE DETECTED!")
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Old IPv6: {last_ipv6}")
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] New IPv6: {current_ipv6}")
                update_dns_records(current_ipv6, zone_id)
                last_ipv6 = current_ipv6
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Update cycle complete. Resuming monitoring...")
            else:
                print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] IPv6 unchanged: {current_ipv6}")
        except KeyboardInterrupt:
            print(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] IPv6 Updater shutting down...")
            break
        except Exception as e:
            print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR in monitoring loop - {e}")
            print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Will retry in next cycle...")

if __name__ == "__main__":
    main()
