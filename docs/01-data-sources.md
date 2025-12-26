# Data Sources

## FUNGuild Database

The FunGuild Obsidian Project uses data from the **FUNGuild** (Fungi Functional Guild) database, a community-driven resource for fungal ecological guild classification.

### Primary Sources

1. **GitHub Repository**: [UMNFuN/FUNGuild](https://github.com/UMNFuN/FUNGuild)
   - Official repository maintained by the University of Minnesota
   - Contains the source code and documentation for the FUNGuild project
   - Provides the Python module for guild assignment

2. **Database API (Fungi)**: [http://www.stbates.org/funguild_db.php](http://www.stbates.org/funguild_db.php)
   - Public HTTP endpoint for the complete FUNGuild database
   - Returns data in JSON format

3. **Database API (Nematodes)**: [http://www.stbates.org/nemaguild_db.php](http://www.stbates.org/nemaguild_db.php)
   - Public HTTP endpoint for the complete NEMAGuild database
   - Used for nematode (roundworm) ecological classification
   - Follows the same JSON structure as FUNGuild

## What is FUNGuild?

FUNGuild is a tool to assign functional guilds to fungi based on taxonomic identification. It helps researchers understand:

- **Trophic Modes**: How fungi obtain nutrients (e.g., saprotroph, pathogen, symbiont)
- **Guilds**: Specific ecological roles (e.g., ectomycorrhizal, wood saprotroph)
- **Growth Forms**: Physical characteristics (e.g., agaricoid, resupinate)
- **Traits**: Additional ecological characteristics

## Data Structure

The database contains records with the following key information:

- **Taxonomic Information**: Taxon name, MycoBank number, taxonomic level
- **Ecological Classification**: Trophic mode, guild, growth form, traits
- **Metadata**: Confidence ranking, citation sources, notes

## Data Updates

The FUNGuild database is community-maintained and updated periodically. To get the latest data:

1. Run the ingestion script: `python ingest_funguild.py`
2. The script will fetch the latest data from the API
3. Records are upserted into the local SQLite database

## Related Documentation

- [Data Extraction](./02-data-extraction.md) - How we extract and process this data
- [Database Schema](./03-database-schema.md) - How the data is structured locally
