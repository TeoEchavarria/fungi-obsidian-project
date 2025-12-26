#!/usr/bin/env python3
"""
ingest_nemaguild.py

A production-quality Python 3.11+ ingestion script for NemaGuild database that:
1. Downloads the NemaGuild dataset (JSON array) from a URL.
2. Robustly interprets the response (JSON or mixed text/HTML).
3. Normalizes fields (handling "NULL" strings, type casting).
4. Identifies duplicates based on taxon name.
5. Merges citation sources for duplicates.
6. Upserts records into a local SQLite database using atomic transactions.

Usage:
    python ingest_nemaguild.py --help
    python ingest_nemaguild.py --dry-run
    python ingest_nemaguild.py --limit 100
"""

import argparse
import datetime
import json
import logging
import re
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Set

import requests

# --- Configuration & Defaults ---

DEFAULT_URL = "http://www.stbates.org/nemaguild_db.php"
DEFAULT_DB_PATH = "../funguild.sqlite"
DEFAULT_TABLE = "nemaguild"
DEFAULT_TIMEOUT = 30
DEFAULT_USER_AGENT = "nemaguild-ingestor/1.0"

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
    first_open = text.find('[')
    if first_open == -1:
        return None

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
        
    # Try iteratively shrinking from the back
    matches = [m.start() for m in re.finditer(r'\]', text)]
    matches.sort(reverse=True)
    
    for end_pos in matches:
        if end_pos < first_open:
            break
        
        sub = text[first_open : end_pos + 1]
        try:
            data = json.loads(sub)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            continue
            
    return None


def merge_citations(citations: List[str]) -> str:
    """
    Merges multiple citation sources into a single string.
    Removes duplicates and joins with semicolon.
    """
    # Split individual citations (they might already be combined with ||)
    all_citations = []
    for cit in citations:
        if not cit:
            continue
        # Split by common separators
        parts = re.split(r'\s*(?:\|\||;)\s*', cit)
        all_citations.extend(parts)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_citations = []
    for cit in all_citations:
        cit = cit.strip()
        if cit and cit not in seen:
            seen.add(cit)
            unique_citations.append(cit)
    
    return " || ".join(unique_citations)


def normalize_record(rec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Normalizes a raw record:
    - Checks required field 'taxon'. If missing/empty, returns None.
    - Converts "NULL" strings to None.
    - Casts numeric fields.
    - Adds metadata fields (raw_json, ingested_at).
    """
    # Helper to treat "NULL" string as None
    def clean_str(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        if s.upper() == "NULL":
            return None
        return s

    # 1. Check taxon (required field for nematodes)
    taxon = clean_str(rec.get("taxon"))
    if not taxon:
        return None  # Skip

    norm = {}
    
    # 2. Extract and Normalize fields
    norm['taxon'] = taxon
    norm['guid'] = clean_str(rec.get("guid"))
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
    norm['raw_json'] = json.dumps(rec, ensure_ascii=False)
    norm['ingested_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    return norm


def find_duplicates(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Groups records by taxon name to identify duplicates.
    Returns a dictionary mapping taxon -> list of records.
    """
    duplicates = {}
    for rec in records:
        taxon = rec['taxon']
        if taxon not in duplicates:
            duplicates[taxon] = []
        duplicates[taxon].append(rec)
    
    return duplicates


def merge_duplicate_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Merges a list of duplicate records into a single record.
    Strategy:
    - Keep the most recent record as base
    - Merge all citation sources
    - Prefer non-null values
    """
    if len(records) == 1:
        return records[0]
    
    # Sort by ingested_at to get the most recent first
    sorted_records = sorted(records, key=lambda x: x['ingested_at'], reverse=True)
    merged = sorted_records[0].copy()
    
    # Collect all citation sources
    citations = []
    for rec in sorted_records:
        if rec.get('citationSource'):
            citations.append(rec['citationSource'])
    
    if citations:
        merged['citationSource'] = merge_citations(citations)
    
    # For other fields, prefer non-null values from newer records
    for rec in sorted_records[1:]:
        for key in ['guild', 'notes', 'trait', 'confidenceRanking', 
                    'trophicMode', 'growthForm', 'guid', 'mbNumber']:
            if not merged.get(key) and rec.get(key):
                merged[key] = rec[key]
    
    return merged


def init_db(conn: sqlite3.Connection, table: str) -> None:
    """
    Creates the table and indexes if they don't exist.
    """
    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    ddl = f"""
    CREATE TABLE IF NOT EXISTS {table} (
        taxon TEXT PRIMARY KEY,
        guid TEXT,
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
        f"CREATE INDEX IF NOT EXISTS idx_{table}_mbNumber ON {table} (mbNumber);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_trophicMode ON {table} (trophicMode);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_guild ON {table} (guild);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_confidenceRanking ON {table} (confidenceRanking);",
        f"CREATE INDEX IF NOT EXISTS idx_{table}_growthForm ON {table} (growthForm);"
    ]

    with conn:
        conn.execute(ddl)
        for idx in indexes:
            conn.execute(idx)


def get_existing_taxa(conn: sqlite3.Connection, table: str, taxa: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Returns a dictionary of existing records from the database for the given taxa.
    Used for duplicate detection and citation merging.
    """
    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    existing = {}
    chunk_size = 900
    
    for i in range(0, len(taxa), chunk_size):
        chunk = taxa[i : i + chunk_size]
        placeholders = ','.join(['?'] * len(chunk))
        query = f"""
        SELECT taxon, guid, mbNumber, taxonomicLevel, trophicMode, guild, 
               confidenceRanking, growthForm, trait, notes, citationSource, 
               raw_json, ingested_at
        FROM {table} WHERE taxon IN ({placeholders})
        """
        
        cursor = conn.execute(query, chunk)
        for row in cursor:
            existing[row[0]] = {
                'taxon': row[0],
                'guid': row[1],
                'mbNumber': row[2],
                'taxonomicLevel': row[3],
                'trophicMode': row[4],
                'guild': row[5],
                'confidenceRanking': row[6],
                'growthForm': row[7],
                'trait': row[8],
                'notes': row[9],
                'citationSource': row[10],
                'raw_json': row[11],
                'ingested_at': row[12]
            }
            
    return existing


def upsert_many(conn: sqlite3.Connection, table: str, records: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    """
    Upserts records in a single transaction.
    For existing records, merges citation sources.
    Returns (inserted_count, updated_count, merged_citations_count).
    """
    if not records:
        return 0, 0, 0

    if not re.match(r'^[a-zA-Z0-9_]+$', table):
        raise ValueError(f"Invalid table name: {table}")

    # 1. Get existing records
    taxa = [r['taxon'] for r in records]
    existing_records = get_existing_taxa(conn, table, taxa)
    
    inserted_count = 0
    updated_count = 0
    merged_citations_count = 0
    
    # 2. Process each record
    processed_records = []
    for rec in records:
        taxon = rec['taxon']
        
        if taxon in existing_records:
            # Merge with existing
            existing = existing_records[taxon]
            merged = merge_duplicate_records([existing, rec])
            
            # Check if citations were actually merged
            old_citations = existing.get('citationSource', '')
            new_citations = merged.get('citationSource', '')
            if old_citations != new_citations:
                merged_citations_count += 1
                logger.info(f"Merging citations for '{taxon}'")
            
            processed_records.append(merged)
            updated_count += 1
        else:
            processed_records.append(rec)
            inserted_count += 1
    
    # 3. Perform Upsert
    sql = f"""
    INSERT INTO {table} (
        taxon, guid, mbNumber, taxonomicLevel, trophicMode, guild, 
        confidenceRanking, growthForm, trait, notes, citationSource, 
        raw_json, ingested_at
    ) VALUES (
        :taxon, :guid, :mbNumber, :taxonomicLevel, :trophicMode, :guild, 
        :confidenceRanking, :growthForm, :trait, :notes, :citationSource, 
        :raw_json, :ingested_at
    )
    ON CONFLICT(taxon) DO UPDATE SET
        guid=excluded.guid,
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

    conn.executemany(sql, processed_records)
    
    return inserted_count, updated_count, merged_citations_count


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest NemaGuild data into SQLite.")
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
    skipped_missing_taxon = 0
    
    for item in raw_data:
        normalized = normalize_record(item)
        if normalized:
            valid_records.append(normalized)
        else:
            skipped_missing_taxon += 1

    # 4. Find and merge duplicates within the fetched data
    duplicate_groups = find_duplicates(valid_records)
    
    merged_records = []
    internal_duplicates = 0
    
    for taxon, recs in duplicate_groups.items():
        if len(recs) > 1:
            internal_duplicates += len(recs) - 1
            logger.info(f"Found {len(recs)} duplicate records for '{taxon}' in fetched data")
            merged = merge_duplicate_records(recs)
            merged_records.append(merged)
        else:
            merged_records.append(recs[0])
    
    total_valid = len(merged_records)
    logger.info(f"Fetched {total_fetched} records. Valid: {total_valid}. "
                f"Skipped (no taxon): {skipped_missing_taxon}. "
                f"Internal duplicates merged: {internal_duplicates}.")

    inserted = 0
    updated = 0
    merged_citations = 0

    if args.dry_run:
        logger.info("Dry run enabled. Skipping DB operations.")
    else:
        # 5. Ingest
        logger.info(f"Connecting to {args.out}...")
        try:
            conn = sqlite3.connect(args.out)
            
            # Use standard journal mode to avoid .shm and .wal files
            conn.execute("PRAGMA journal_mode=DELETE;")
            
            init_db(conn, args.table)
            
            with conn:
                inserted, updated, merged_citations = upsert_many(conn, args.table, merged_records)
            
            conn.close()
            logger.info("Database ingestion complete.")
            
        except sqlite3.Error as e:
            logger.error(f"Database error: {e}")
            sys.exit(1)

    elapsed_time = time.perf_counter() - start_time

    # Summary
    print("\n--- NemaGuild Ingestion Summary ---")
    print(f"Total Records Fetched:      {total_fetched}")
    print(f"Processing Limited To:      {args.limit if args.limit else 'All'}")
    print(f"Total Valid Records:        {total_valid}")
    print(f"Skipped (No Taxon):         {skipped_missing_taxon}")
    print(f"Internal Duplicates Merged: {internal_duplicates}")
    if not args.dry_run:
        print(f"Inserted:                   {inserted}")
        print(f"Updated:                    {updated}")
        print(f"Citations Merged:           {merged_citations}")
        print(f"Database File:              {args.out}")
    else:
        print("Mode:                       DRY-RUN (No DB changes)")
    print(f"Elapsed Time:               {elapsed_time:.2f} seconds")
    print("------------------------------------\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
