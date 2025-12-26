# FunGuild Obsidian Project

> **🌐 Live Application**: [https://fungi-obsidian-project.vercel.app/](https://fungi-obsidian-project.vercel.app/)

A modern web application for exploring and analyzing fungal guild data from the FUNGuild database.

## Overview

This project provides an interactive interface to browse, search, and filter fungal ecological guild data. The application uses a local SQLite database populated from the FUNGuild database and provides a fast, client-side web interface for data exploration.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd funguild-ui
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Access the application:**
   Open your browser to `http://localhost:3000`

## Features

- 🔍 **Advanced Search**: Search across all fungal taxa
- 🎯 **Multi-filter System**: Filter by trophic mode, guild, growth form, and confidence ranking
- 📊 **Interactive Table**: Sortable columns with detailed information
- 🌐 **Client-side Database**: Fast queries using SQL.js (SQLite in the browser)
- 🔐 **Authentication**: Secure access with MongoDB user management
- 💬 **Comments**: Authenticated users can annotate and discuss individual records


## Documentation

For detailed information, see the [documentation folder](./docs):

- [Data Sources](./docs/01-data-sources.md) - Where the data comes from
- [Data Extraction](./docs/02-data-extraction.md) - How we extract and process the data
- [Database Schema](./docs/03-database-schema.md) - Database structure and fields
- [Web Interface](./docs/04-web-interface.md) - Frontend architecture and features
- [API Documentation](./docs/05-api.md) - Backend API endpoints
- [Deployment](./docs/06-deployment.md) - How to deploy the application
- [Commenting System](./docs/07-commenting.md) - How to use and manage comments


## Project Structure

```
fungi-obsidian-project/
├── scripts/                 # Ingestion scripts
│   ├── ingest_funguild.py   # Python script to fetch fungi data
│   └── ingest_nemaguild.py  # Python script to fetch nematode data
├── funguild.sqlite          # SQLite database with fungal guild data
└── funguild-ui/             # Web application
    ├── public/              # Static files and client-side app
    ├── api/                 # Serverless API functions
    └── package.json         # Node.js dependencies
```

## License

MIT License - See [LICENSE](./LICENSE) file for details

## Credits

- **Data Source**: [FUNGuild Database](https://github.com/UMNFuN/FUNGuild)
- **Database API**: [http://www.stbates.org/funguild_db.php](http://www.stbates.org/funguild_db.php)