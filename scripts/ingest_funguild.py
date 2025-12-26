#!/usr/bin/env python3
"""
ingest_funguild.py

A production-quality Python 3.11+ ingestion script that:
1. Downloads the Funguild dataset (JSON array) from a URL.
2. Robustly interprets the response (JSON or mixed text/HTML).
3. Normalizes fields (handling "NULL" strings, type casting).
4. Upserts records into a local SQLite database using atomic transactions.

Usage:
    python ingest_funguild.py --help
    python ingest_funguild.py --dry-run
    python ingest_funguild.py --limit 100
"""

import argparse
import datetime
import json
import logging
import re
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

# --- Configuration & Defaults ---

DEFAULT_URL = "http://www.stbates.org/funguild_db.php"
DEFAULT_DB_PATH = "../funguild-ui/public/funguild.sqlite"
DEFAULT_TABLE = "funguild"
DEFAULT_TIMEOUT = 30
DEFAULT_USER_AGENT = "funguild-ingestor/1.0"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


def fetch_data(url: str, timeout: int, user_agent: str) -> List[Dict[str, Any]]:
    """
    Fetches data from the URL. Tries standard JSON parsing first.
    If that fails (mixed content/HTML), falls back to extracting the first JSON array.
    """
    headers = {"User-Agent": user_agent}
    logger.info(f"Fetching data from {url} (timeout={timeout}s)...")
    
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"HTTP request failed: {e}")
        sys.exit(1)

    text = resp.text

    # Attempt 1: Direct JSON parsing
    try:
        data = resp.json()
        if isinstance(data, list):
            logger.info("Successfully parsed response as JSON list.")
            return data
        else:
            logger.warning("Response is JSON but not a list. Proceeding to fallback extraction.")
    except json.JSONDecodeError:
        logger.info("Response is not valid straight JSON. Attempting fallback extraction...")

    # Attempt 2: Fallback extraction
    extracted = extract_json_array(text)
    if extracted is not None:
        logger.info(f"Fallback extraction successful. Found {len(extracted)} records.")
        return extracted

    # Failure
    sample = text[:500].replace("\n", " ")
    logger.error(f"Failed to parse JSON array from response. Start of content: {sample}...")
    sys.exit(1)


def extract_json_array(text: str) -> Optional[List[Dict[str, Any]]]:
    """
    Scans the text for the first valid JSON array `[...]`.
    """
    # Simple heuristic: find first '[' and last ']'
    start_candidates = [m.start() for m in re.finditer(r'\[', text)]
    
    if not start_candidates:
        return None

    # Try from the first '['
    # In a more complex scenario, we might iterate all candidates. 
    # For now, we assume the main payload is the *first* array or the *largest* array.
    # Given the requirements, we'll try to find the outermost valid one starting at the first '['.
    
    # We will try to parse from first candidate start index to the last ']'
    # If that fails, we might just look for the largest structure.
    
    # Let's try a robust approach: find first '[' and try to match brackets?
    # Actually, json.loads allows trailing data if we slice correctly.
    # But python's json.loads needs the exact string.
    
    # Strategy: Find first '['. Then look for last ']'. Try loads.
    # If fail, back off the end index to previous ']'.
    
    first_open = text.find('[')
    if first_open == -1:
        return None

    # We'll try from the end backwards
    # This is O(N) where N is number of closing brackets
    
    candidate_text = text[first_open:]
    # Optimization: just try strictly finding the matching closing bracket is hard without a parser.
    # Let's try the simple approach first: strictly between first '[' and last ']'.
    
    last_close = text.rfind(']')
    if last_close == -1 or last_close < first_open:
        return None

    substring = text[first_open : last_close + 1]
    
    try:
        data = json.loads(substring)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
        
    # If that failed, it might be that there's garbage *inside* or the bracket matching is wrong.
    # Let's try a regex solution for "non-greedy" match if the above failed, 
    # but for a potentially huge dataset regex might be slow or hit recursion limits.
    # A standard "mixed content" usually has Header... [ JSON ] ... Footer.
    
    # Let's try iteratively shrinking from the back if the first attempt failed.
    # (Just a few attempts to avoid hanging)
    # We will look for other ']' positions.
    
    matches = [m.start() for m in re.finditer(r'\]', text)]
    # Reverse to start from end
    matches.sort(reverse=True)
    
    for end_pos in matches:
        if end_pos < first_open:
            break
        
        # We already tried the very last one above (roughly), but let's be rigorous
        sub = text[first_open : end_pos + 1]
        try:
            data = json.loads(sub)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            continue
            
    return None


def normalize_record(rec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Normalizes a raw record:
    - Checks required field 'guid'. If missing/empty, returns None.
    - Converts "NULL" strings to None.
    - Casts numeric fields.
    - Adds metadata fields (raw_json, ingested_at).
    """
    # 1. Check GUID
    guid = rec.get("guid")
    if not guid or (isinstance(guid, str) and not guid.strip()):
        return None  # Skip

    norm = {}
    
    # Helper to treat "NULL" string as None
    def clean_str(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        if s.upper() == "NULL":
            return None
        return s

    # 2. Extract and Normalize fields
    norm['guid'] = str(guid).strip()
    norm['taxon'] = clean_str(rec.get("taxon"))
    norm['mbNumber'] = clean_str(rec.get("mbNumber"))
    
    # taxonomicLevel: cast to int if possible
    t_level = clean_str(rec.get("taxonomicLevel"))
    if t_level is not None:
        try:
            norm['taxonomicLevel'] = int(t_level)
        except ValueError:
            norm['taxonomicLevel'] = None
    else:
        norm['taxonomicLevel'] = None

    norm['trophicMode'] = clean_str(rec.get("trophicMode"))
    norm['guild'] = clean_str(rec.get("guild"))
    norm['confidenceRanking'] = clean_str(rec.get("confidenceRanking"))
    norm['growthForm'] = clean_str(rec.get("growthForm"))
    norm['trait'] = clean_str(rec.get("trait"))
    norm['notes'] = clean_str(rec.get("notes"))
    norm['citationSource'] = clean_str(rec.get("citationSource"))

    # 3. Metadata
    # We store the *original* record as received in raw_json
    norm['raw_json'] = json.dumps(rec, ensure_ascii=False)
    norm['ingested_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    return norm


def init_db(conn: sqlite3.Connection, table: str) -> None:
    """
    Creates the table and indexes if they don't exist.
    """
    # Safe parametrization for table name is not supported by sqlite3 execute parameters (only values).
    # Since 'table' comes from trusted CLI args (or default), we format it in. 
    # But we validate it strictly to be safe.
    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    ddl = f"""
    CREATE TABLE IF NOT EXISTS {table} (
        guid TEXT PRIMARY KEY,
        taxon TEXT,
        mbNumber TEXT,
        taxonomicLevel INTEGER,
        trophicMode TEXT,
        guild TEXT,
        confidenceRanking TEXT,
        growthForm TEXT,
        trait TEXT,
        notes TEXT,
        citationSource TEXT,
        raw_json TEXT,
        ingested_at TEXT
    );
    """
    
    indexes = [
        f"CREATE INDEX IF NOT EXISTS idx_{table}_taxon ON {table} (taxon);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_mbNumber ON {table} (mbNumber);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_trophicMode ON {table} (trophicMode);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_guild ON {table} (guild);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_confidenceRanking ON {table} (confidenceRanking);"
    ]

    with conn:
        conn.execute(ddl)
        for idx in indexes:
            conn.execute(idx)


def get_existing_guids(conn: sqlite3.Connection, table: str, guids: List[str]) -> set:
    """
    Returns a set of guids from the input list that already exist in the DB.
    Used for statistics (inserted vs updated).
    Done in chunks to avoid variable limit issues.
    """
    # Sanitize table again just in case
    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    existing = set()
    chunk_size = 900  # SQLite limit is usually 999 or higher variables
    
    for i in range(0, len(guids), chunk_size):
        chunk = guids[i : i + chunk_size]
        placeholders = ','.join(['?'] * len(chunk))
        query = f"SELECT guid FROM {table} WHERE guid IN ({placeholders})"
        
        cursor = conn.execute(query, chunk)
        for row in cursor:
            existing.add(row[0])
            
    return existing


def upsert_many(conn: sqlite3.Connection, table: str, records: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Upserts records in a single transaction.
    Returns (inserted_count, updated_count).
    """
    if not records:
        return 0, 0

    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    # 1. Identify which are updates vs inserts for stats
    #    (This adds overhead but meets the requirement to report counts)
    guids = [r['guid'] for r in records]
    existing_guids = get_existing_guids(conn, table, guids)
    
    updated_count = len(existing_guids)
    inserted_count = len(records) - updated_count

    # 2. Perform Upsert
    sql = f"""
    INSERT INTO {table} (
        guid, taxon, mbNumber, taxonomicLevel, trophicMode, guild, 
        confidenceRanking, growthForm, trait, notes, citationSource, 
        raw_json, ingested_at
    ) VALUES (
        :guid, :taxon, :mbNumber, :taxonomicLevel, :trophicMode, :guild, 
        :confidenceRanking, :growthForm, :trait, :notes, :citationSource, 
        :raw_json, :ingested_at
    )
    ON CONFLICT(guid) DO UPDATE SET
        taxon=excluded.taxon,
        mbNumber=excluded.mbNumber,
        taxonomicLevel=excluded.taxonomicLevel,
        trophicMode=excluded.trophicMode,
        guild=excluded.guild,
        confidenceRanking=excluded.confidenceRanking,
        growthForm=excluded.growthForm,
        trait=excluded.trait,
        notes=excluded.notes,
        citationSource=excluded.citationSource,
        raw_json=excluded.raw_json,
        ingested_at=excluded.ingested_at;
    """

    # We rely on 'with conn' in the caller or here for transaction
    conn.executemany(sql, records)
    
    return inserted_count, updated_count


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Funguild data into SQLite.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Source URL")
    parser.add_argument("--out", default=DEFAULT_DB_PATH, help="Output SQLite file path")
    parser.add_argument("--table", default=DEFAULT_TABLE, help="Target table name")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="HTTP timeout (seconds)")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="User-Agent string")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but do not write to DB")
    parser.add_argument("--limit", type=int, help="Limit number of records to process")
    
    args = parser.parse_args()

    start_time = time.perf_counter()

    # 1. Fetch
    raw_data = fetch_data(args.url, args.timeout, args.user_agent)
    total_fetched = len(raw_data)
    
    # 2. Slice if limit
    if args.limit and args.limit > 0:
        logger.info(f"Limiting to first {args.limit} records.")
        raw_data = raw_data[:args.limit]

    # 3. Normalize
    valid_records = []
    skipped_missing_guid = 0
    
    for item in raw_data:
        normalized = normalize_record(item)
        if normalized:
            valid_records.append(normalized)
        else:
            skipped_missing_guid += 1

    total_valid = len(valid_records)
    logger.info(f"Fetched {total_fetched} records. Valid: {total_valid}. Skipped (no guid): {skipped_missing_guid}.")

    inserted = 0
    updated = 0

    if args.dry_run:
        logger.info("Dry run enabled. Skipping DB operations.")
    else:
        # 4. Ingest
        logger.info(f"Connecting to {args.out}...")
        try:
            conn = sqlite3.connect(args.out)
            
            # Use standard journal mode to avoid .shm and .wal files
            conn.execute("PRAGMA journal_mode=DELETE;")
            
            init_db(conn, args.table)
            
            with conn: # Transaction configuration
                inserted, updated = upsert_many(conn, args.table, valid_records)
            
            conn.close()
            logger.info("Database ingestion complete.")
            
        except sqlite3.Error as e:
            logger.error(f"Database error: {e}")
            sys.exit(1)

    elapsed_time = time.perf_counter() - start_time

    # Summary
    print("\n--- Ingestion Summary ---")
    print(f"Total Records Fetched: {total_fetched}")
    print(f"Processing Limited To: {args.limit if args.limit else 'All'}")
    print(f"Total Valid Records:   {total_valid}")
    print(f"Skipped (No GUID):     {skipped_missing_guid}")
    if not args.dry_run:
        print(f"Inserted:              {inserted}")
        print(f"Updated:               {updated}")
        print(f"Database File:         {args.out}")
    else:
        print("Mode:                  DRY-RUN (No DB changes)")
    print(f"Elapsed Time:          {elapsed_time:.2f} seconds")
    print("-------------------------\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
