import requests
import sqlite3
import json
import datetime

DB_PATH = "funguild-ui/public/funguild.sqlite"
TABLE_NAME = "funguild"
ANCHOR_FUNGI_GUID = "F_0000000000_ANCHOR_FUNGI"

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
    cursor.execute(
        f"SELECT guid FROM {TABLE_NAME} WHERE taxon = ? AND taxonomicLevel = ?",
        (taxon, level)
    )
    row = cursor.fetchone()
    
    if row:
        guid = row[0]
        # Update parent_guid if it exists
        cursor.execute(
            f"UPDATE {TABLE_NAME} SET parent_guid = ? WHERE guid = ?",
            (parent_guid, guid)
        )
        # print(f"  [UPDATE] {taxon} (Level {level}) -> parent: {parent_guid}")
        return guid
    else:
        # Create new deterministic GUID
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
        # print(f"  [INSERT] {taxon} (Level {level}) guid: {new_guid} -> parent: {parent_guid}")
        return new_guid

def run_ingestion():
    conn = sqlite3.connect(DB_PATH)
    try:
        # 1. Level 1: Phyla (Level 3)
        phyla = get_id_level_base("F")
        print(f"Processing {len(phyla)} Phyla...")
        for item in phyla:
            if item['name'] == "Not assigned":
                continue
            
            p_guid = upsert_node(
                conn, item['name'], 3, ANCHOR_FUNGI_GUID, 
                item['id'], item['rank'], item
            )
            print(f"Phylum: {item['name']} ({p_guid})")
            
            # 2. Level 2: Classes (Level 5)
            classes = get_id_level_base(item['id'])
            for subitem in classes:
                if subitem['name'] == "Not assigned":
                    continue
                
                c_guid = upsert_node(
                    conn, subitem['name'], 5, p_guid, 
                    subitem['id'], subitem['rank'], subitem
                )
                # print(f"\tClass: {subitem['name']} ({c_guid})")
                
                # 3. Level 3: Orders (Level 7)
                orders = get_id_level_base(subitem['id'])
                for subsubitem in orders:
                    if subsubitem['name'] == "Not assigned":
                        continue
                    
                    o_guid = upsert_node(
                        conn, subsubitem['name'], 7, c_guid, 
                        subsubitem['id'], subsubitem['rank'], subsubitem
                    )
                    # print(f"\t\tOrder: {subsubitem['name']} ({o_guid})")
            
            # Commit after each phylum to save progress
            conn.commit()
            
        print("Ingestion complete!")
        
    finally:
        conn.close()

if __name__ == "__main__":
    run_ingestion()
