# Data Extraction

## Overview

The data extraction process uses Python scripts (located in `scripts/`) to fetch data from the FUNGuild and NemaGuild APIs and populate a local SQLite database.

## The Ingestion Script

### Purpose

The ingestion scripts are production-quality Python 3.11+ tools that:

1. Download the datasets from the HTTP APIs
2. Parses JSON data (with fallback for mixed HTML/JSON responses)
3. Normalizes and validates records
4. Upserts data into a SQLite database with atomic transactions

### Key Features

- **Robust Parsing**: Handles both pure JSON and mixed content responses
- **Data Normalization**: Converts "NULL" strings to proper NULL values
- **Type Casting**: Ensures proper data types (e.g., taxonomicLevel as integer)
- **Atomic Transactions**: All database operations are transactional
- **Upsert Logic**: Updates existing records or inserts new ones based on GUID
- **Performance Optimized**: Uses WAL mode and batch operations

## Usage

### Basic Usage

#### FUNGuild (Fungi)
```bash
# Fetch all data and populate database
python scripts/ingest_funguild.py

# Dry run (fetch and parse but don't write to database)
python scripts/ingest_funguild.py --dry-run
```

#### NemaGuild (Nematodes)
```bash
# Fetch all records and merge duplicates/citations
python scripts/ingest_nemaguild.py

# Dry run
python scripts/ingest_nemaguild.py --dry-run

# Limit records
python scripts/ingest_nemaguild.py --limit 100
```

### Command-Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--url` | `http://www.stbates.org/funguild_db.php` | Source URL for data |
| `--out` | `./funguild.sqlite` | Output SQLite file path |
| `--table` | `funguild` | Target table name |
| `--timeout` | `30` | HTTP timeout in seconds |
| `--user-agent` | `funguild-ingestor/1.0` | User-Agent string |
| `--dry-run` | `false` | Fetch and parse without writing to DB |
| `--limit` | None | Limit number of records to process |

## Data Processing Pipeline

### 1. Fetch Data

```python
fetch_data(url, timeout, user_agent) -> List[Dict]
```

- Makes HTTP GET request to the FUNGuild API
- Attempts direct JSON parsing
- Falls back to extracting JSON array from mixed content
- Returns list of raw records

### 2. Normalize Records

```python
normalize_record(rec) -> Optional[Dict]
```

For each record:
- Validates required field (GUID for fungi, taxon for nematodes)
- Converts "NULL" strings to None
- Casts numeric fields (e.g., taxonomicLevel to integer)
- Adds metadata (raw_json, ingested_at timestamp)
- Returns None for invalid records (skipped)

### 3. Database Operations

```python
init_db(conn, table) -> None
upsert_many(conn, table, records) -> (inserted, updated)
```

- Creates table and indexes if they don't exist
- Identifies existing records by unique key (GUID for funghi, Taxon for nematodes)
- For NemaGuild, intelligently merges citation sources for duplicates
- Performs batch upsert operation
- Returns counts of inserted vs updated records

## Output

The script provides a detailed summary:

```
--- Ingestion Summary ---
Total Records Fetched: 15234
Processing Limited To: All
Total Valid Records:   15234
Skipped (No GUID):     0
Inserted:              15234
Updated:               0
Database File:         ./funguild.sqlite
Elapsed Time:          12.45 seconds
-------------------------
```

## Error Handling

- **HTTP Errors**: Logs error and exits with status code 1
- **JSON Parsing Errors**: Attempts fallback extraction before failing
- **Database Errors**: Logs SQLite errors and exits gracefully
- **Invalid Records**: Skips records without GUID, reports in summary

## Performance Considerations

- **WAL Mode**: Write-Ahead Logging for better concurrency
- **Batch Operations**: All records inserted in a single transaction
- **Chunked Queries**: GUID lookups done in chunks to avoid variable limits
- **Indexed Fields**: Key fields indexed for fast queries

## Related Documentation

- [Data Sources](./01-data-sources.md) - Where the data comes from
- [Database Schema](./03-database-schema.md) - Structure of the SQLite database
