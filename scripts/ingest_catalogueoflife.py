import requests
import sqlite3
import json
import datetime
import time

DB_PATH = "funguild-ui/public/funguild.sqlite"
TABLE_NAME = "funguild"
ANCHOR_FUNGI_GUID = "F_0000000000_ANCHOR_FUNGI"

# Mapping of ChecklistBank ranks to our database taxonomic levels
RANK_LEVEL_MAP = {
    "kingdom": 0,
    "phylum": 3,
    "class": 5,
    "order": 7,
    "family": 9,
    "genus": 13,
    "species": 20
}

def get_id_level_base(ID):
    url = f"https://api.checklistbank.org/dataset/313100/tree/{ID}/children?limit=1000&offset=0&type=project&insertPlaceholder=true"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.json().get("result", [])
    except Exception as e:
        print(f"Error fetching {ID}: {e}")
        return []

def upsert_node(conn, taxon, level, parent_guid, api_id, rank, raw_json):
    """
    Inserts or updates a taxonomic node.
    Returns the GUID of the record (existing or new).
    """
    cursor = conn.cursor()
    
    # Check if record exists by taxon and level
    # We use taxon + level as the unique identifier for matching existing records
    cursor.execute(
        f"SELECT guid FROM {TABLE_NAME} WHERE taxon = ? AND taxonomicLevel = ?",
        (taxon, level)
    )
    row = cursor.fetchone()
    
    if row:
        guid = row[0]
        # Update parent_guid to ensure hierarchy is correct
        cursor.execute(
            f"UPDATE {TABLE_NAME} SET parent_guid = ? WHERE guid = ?",
            (parent_guid, guid)
        )
        return guid
    else:
        # Create new deterministic GUID if it doesn't exist
        new_guid = f"GBIF_{rank.upper()}_{api_id}"
        cursor.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                guid, taxon, taxonomicLevel, parent_guid, raw_json, ingested_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                new_guid,
                taxon,
                level,
                parent_guid,
                json.dumps(raw_json, ensure_ascii=False),
                datetime.datetime.now(datetime.timezone.utc).isoformat()
            )
        )
        return new_guid

record_counter = 0

def ingest_recursive(conn, api_id, parent_guid, current_rank_index):
    """
    Recursively ingests taxonomy levels.
    """
    global record_counter
    ranks = list(RANK_LEVEL_MAP.keys())
    if current_rank_index >= len(ranks):
        return

    children = get_id_level_base(api_id)
    if not children:
        return

    for child in children:
        name = child.get("name")
        rank = child.get("rank")
        child_id = child.get("id")

        if name == "Not assigned" or not name:
            continue

        # Get the level for this rank
        level = RANK_LEVEL_MAP.get(rank.lower())
        
        # If the rank isn't in our map, we skip it or could potentially map it to a nearby level
        if level is None:
            # print(f"  [SKIP] Unknown rank: {rank} for {name}")
            continue

        # Upsert and get the GUID
        guid = upsert_node(conn, name, level, parent_guid, child_id, rank, child)
        record_counter += 1
        
        # Batch commit every 100 records
        if record_counter % 100 == 0:
            conn.commit()
            print(f"  [COMMIT] {record_counter} records processed.")

        # Log progress for higher levels
        indent = "  " * current_rank_index
        if level <= 9: # Only print up to Family to avoid log flooding
            print(f"{indent}{rank.capitalize()}: {name} ({guid})")

        # Recursively fetch children if not at the bottom (species)
        if rank.lower() != "species":
            ingest_recursive(conn, child_id, guid, current_rank_index + 1)
            # Sleep briefly to be respectful to the API
            time.sleep(0.05)

def run_ingestion():
    conn = sqlite3.connect(DB_PATH)
    try:
        print("Starting deep taxonomy ingestion (Reino Fungi)...")
        # Start recursion from Phylum (F is Kingdom, which is our anchor)
        # current_rank_index=1 corresponds to 'phylum' in RANK_LEVEL_MAP
        ingest_recursive(conn, "F", ANCHOR_FUNGI_GUID, 1)
        conn.commit()
        print("Final commit successful.")
        print("Deep ingestion complete!")
    except Exception as e:
        print(f"An error occurred during ingestion: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    run_ingestion()
