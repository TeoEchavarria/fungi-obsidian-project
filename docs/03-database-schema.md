# Database Schema

## Overview

The FunGuild data is stored in a SQLite database with a single normalized table containing all fungal guild records.

## Table: `funguild`

### Schema Definition

```sql
CREATE TABLE funguild (
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
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `guid` | TEXT | **Primary Key**. Unique identifier for each record |
| `taxon` | TEXT | Taxonomic name (e.g., "Agaricus bisporus") |
| `mbNumber` | TEXT | MycoBank number for taxonomic reference |
| `taxonomicLevel` | INTEGER | Taxonomic rank level (numeric) |
| `trophicMode` | TEXT | How the fungus obtains nutrients (e.g., "Saprotroph", "Pathogen") |
| `guild` | TEXT | Specific ecological guild (e.g., "Wood Saprotroph", "Ectomycorrhizal") |
| `confidenceRanking` | TEXT | Confidence level of the guild assignment (e.g., "Highly Probable", "Probable") |
| `growthForm` | TEXT | Physical growth form (e.g., "Agaricoid", "Resupinate") |
| `trait` | TEXT | Additional ecological traits |
| `notes` | TEXT | Additional notes about the record |
| `citationSource` | TEXT | Source citations for the guild assignment |
| `raw_json` | TEXT | Original JSON record as received from the API |
| `ingested_at` | TEXT | ISO 8601 timestamp of when the record was ingested |

### Indexes

For optimal query performance, the following indexes are created:

```sql
CREATE INDEX idx_funguild_taxon ON funguild (taxon);
CREATE INDEX idx_funguild_mbNumber ON funguild (mbNumber);
CREATE INDEX idx_funguild_trophicMode ON funguild (trophicMode);
CREATE INDEX idx_funguild_guild ON funguild (guild);
CREATE INDEX idx_funguild_confidenceRanking ON funguild (confidenceRanking);
```

## Data Characteristics

### NULL Values

- Fields may contain NULL values when data is not available
- The ingestion script converts "NULL" strings to proper NULL values
- NULL values are handled gracefully in queries

### Taxonomic Levels

The `taxonomicLevel` field uses numeric codes:

- `0` = Species
- `13` = Genus
- `20` = Family
- (Other values as defined by the FUNGuild database)

### Trophic Modes

Common values include:

- Saprotroph
- Pathogen
- Symbiont
- Pathotroph-Saprotroph
- Pathotroph-Symbiotroph

### Guilds

Examples of specific guilds:

- Wood Saprotroph
- Ectomycorrhizal
- Arbuscular Mycorrhizal
- Plant Pathogen
- Dung Saprotroph
- Soil Saprotroph

### Confidence Rankings

- **Highly Probable**: Strong evidence for guild assignment
- **Probable**: Good evidence but some uncertainty
- **Possible**: Limited evidence, speculative assignment

## Database Configuration

The database uses the following SQLite optimizations:

```sql
PRAGMA journal_mode=WAL;      -- Write-Ahead Logging for better concurrency
PRAGMA synchronous=NORMAL;    -- Balance between safety and performance
PRAGMA temp_store=MEMORY;     -- Store temporary tables in memory
```

## Example Queries

### Search by taxon name

```sql
SELECT * FROM funguild 
WHERE taxon LIKE '%Agaricus%' 
ORDER BY taxon;
```

### Filter by trophic mode

```sql
SELECT taxon, guild, confidenceRanking 
FROM funguild 
WHERE trophicMode = 'Saprotroph';
```

### Count records by guild

```sql
SELECT guild, COUNT(*) as count 
FROM funguild 
GROUP BY guild 
ORDER BY count DESC;
```

### Get all ectomycorrhizal fungi

```sql
SELECT taxon, growthForm, citationSource 
FROM funguild 
WHERE guild LIKE '%Ectomycorrhizal%';
```

## Related Documentation

- [Data Extraction](./02-data-extraction.md) - How data is populated into this schema
- [Web Interface](./04-web-interface.md) - How the UI queries this database
