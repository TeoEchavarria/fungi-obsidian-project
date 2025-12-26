# Web Interface

## Overview

The FunGuild web application is a modern, client-side application that runs entirely in the browser using SQL.js to query a local SQLite database.

## Architecture

### Technology Stack

- **Frontend**: Pure HTML, CSS, and JavaScript
- **Database**: SQL.js (SQLite compiled to WebAssembly)
- **Authentication**: Supabase
- **Hosting**: Vercel
- **API**: Serverless functions (Vercel Functions)

### Key Components

1. **[index.html](../funguild-ui/public/index.html)** - Main application structure
2. **[app.js](../funguild-ui/public/app.js)** - Application logic and database queries
3. **[auth.js](../funguild-ui/public/auth.js)** - Authentication handling
4. **[sql-wasm.js](../funguild-ui/public/sql-wasm.js)** - SQL.js library
5. **[funguild.sqlite](../funguild-ui/public/funguild.sqlite)** - SQLite database (17.7 MB)

## Features

### 🔍 Search Functionality

- **Full-text search** across taxon names
- **Real-time filtering** as you type
- **Case-insensitive** matching
- **Wildcard support** using SQL LIKE patterns

### 🎯 Advanced Filtering

Multi-select filters for:

- **Trophic Mode**: Filter by how fungi obtain nutrients
- **Guild**: Filter by specific ecological guilds
- **Growth Form**: Filter by physical characteristics
- **Confidence Ranking**: Filter by assignment confidence

### 📊 Data Display

- **Sortable table** with clickable column headers
- **Pagination** for large result sets
- **Responsive design** for mobile and desktop
- **Detailed record view** with all available information

### 🔐 Authentication

- **Supabase integration** for user management
- **Protected access** to the application
- **Session management** with automatic token refresh

## User Interface

### Layout

```
┌─────────────────────────────────────────┐
│           Header / Navigation            │
├─────────────────────────────────────────┤
│                                          │
│  Search Bar                              │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Trophic  │ │  Guild   │ │ Growth  │ │
│  │  Mode    │ │          │ │  Form   │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│                                          │
│  ┌──────────────────────────────────┐  │
│  │                                   │  │
│  │      Results Table                │  │
│  │                                   │  │
│  │  Taxon | Trophic | Guild | ...   │  │
│  │  ------|---------|-------|-----   │  │
│  │  ...   | ...     | ...   | ...   │  │
│  │                                   │  │
│  └──────────────────────────────────┘  │
│                                          │
│           Pagination Controls            │
│                                          │
└─────────────────────────────────────────┘
```

### Color Scheme

The application uses a modern, dark-themed design with:

- **Primary colors**: Blues and purples
- **Accent colors**: Vibrant highlights for interactive elements
- **Background**: Dark gradients for reduced eye strain
- **Text**: High contrast for readability

## Client-Side Database

### Loading the Database

```javascript
// Load SQL.js library
const SQL = await initSqlJs({
  locateFile: file => `/sql-wasm.wasm`
});

// Fetch the SQLite database file
const response = await fetch('/funguild.sqlite');
const buffer = await response.arrayBuffer();

// Create database instance
const db = new SQL.Database(new Uint8Array(buffer));
```

### Query Execution

```javascript
// Execute SQL query
const results = db.exec(`
  SELECT * FROM funguild 
  WHERE taxon LIKE '%${searchTerm}%'
  LIMIT 100
`);

// Process results
const rows = results[0].values;
```

### Performance Considerations

- **Database size**: ~17.7 MB (loads once, cached by browser)
- **Query speed**: Instant (runs in browser memory)
- **No server roundtrips**: All queries execute locally
- **Offline capable**: Works without internet after initial load

## Responsive Design

The interface adapts to different screen sizes:

- **Desktop**: Full table view with all columns
- **Tablet**: Condensed table with essential columns
- **Mobile**: Card-based layout for better readability

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Mobile browsers**: Optimized for touch interfaces

## Future Enhancements

Potential improvements:

- [ ] Export results to CSV/JSON
- [ ] Save custom filter presets
- [ ] Advanced query builder
- [ ] Data visualization charts
- [ ] Comparison tools for multiple taxa

## Related Documentation

- [Database Schema](./03-database-schema.md) - Understanding the data structure
- [API Documentation](./05-api.md) - Backend API endpoints
- [Deployment](./06-deployment.md) - How to deploy the application
