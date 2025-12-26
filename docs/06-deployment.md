# Deployment Guide

## Overview

The FunGuild application is deployed on Vercel, a cloud platform for static sites and serverless functions.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- [Vercel CLI](https://vercel.com/cli) installed (optional)
- MongoDB Atlas account (for authentication)
- Vercel account

## Environment Setup

### 1. MongoDB Setup

1. Create a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account
2. Create a new cluster
3. Create a database user with read/write permissions
4. Whitelist your IP address (or use `0.0.0.0/0` for development)
5. Get your connection string

### 2. Environment Variables

Create a `.env` file in the `funguild-ui` directory:

```bash
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGO_DB=fungiDataBase
```

**Important**: Never commit `.env` to version control!

## Local Development

### 1. Install Dependencies

```bash
cd funguild-ui
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

This starts the Vercel development server at `http://localhost:3000`.

### 3. Test Locally

- Open browser to `http://localhost:3000`
- Test authentication flow
- Test database queries
- Verify all features work

## Deployment to Vercel

### Option 1: Vercel CLI (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   cd funguild-ui
   vercel
   ```

4. **Set Environment Variables:**
   ```bash
   vercel env add MONGO_URI
   vercel env add MONGO_DB
   ```

5. **Deploy to Production:**
   ```bash
   vercel --prod
   ```

### Option 2: GitHub Integration

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Deploy to Vercel"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select `funguild-ui` as the root directory

3. **Configure Environment Variables:**
   - In Vercel dashboard, go to Settings → Environment Variables
   - Add `MONGO_URI` and `MONGO_DB`

4. **Deploy:**
   - Vercel automatically deploys on every push to `main`
   - Preview deployments created for pull requests

## Vercel Configuration

The `vercel.json` file configures:

### Headers

```json
{
  "headers": [
    {
      "source": "/(.*)\\.wasm",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/wasm"
        }
      ]
    },
    {
      "source": "/(.*)\\.sqlite",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/octet-stream"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**Key configurations:**

- `.wasm` files served with correct MIME type
- `.sqlite` files cached for 1 year (immutable)
- Default cache policy for other files

## Database Updates

### Updating the SQLite Database

1. **Run ingestion script locally:**
   ```bash
   python ingest_funguild.py
   ```

2. **Copy database to web app:**
   ```bash
   cp funguild.sqlite funguild-ui/public/
   ```

3. **Deploy updated database:**
   ```bash
   cd funguild-ui
   vercel --prod
   ```

**Note**: The SQLite database is ~17.7 MB. Vercel has a 100 MB limit for static files.

## Performance Optimization

### Caching Strategy

- **SQLite database**: Cached for 1 year (immutable)
- **WASM files**: Cached with correct MIME type
- **Static assets**: Browser caching enabled

### Bundle Size

Current bundle sizes:

- `funguild.sqlite`: 17.7 MB
- `sql-wasm.wasm`: 644 KB
- `sql-wasm.js`: 47.6 KB
- `app.js`: 16.9 KB
- `index.html`: 18.1 KB

**Total initial load**: ~18.4 MB

### Optimization Tips

1. **Compress database**: Use SQLite VACUUM command
2. **Enable gzip**: Vercel automatically enables compression
3. **Lazy load**: Consider loading database on demand
4. **CDN**: Vercel uses global CDN by default

## Monitoring

### Vercel Analytics

Enable analytics in Vercel dashboard:

- Page views
- Performance metrics
- Error tracking
- User geography

### Logs

View function logs:

```bash
vercel logs
```

Or in Vercel dashboard under "Deployments" → "Functions"

## Troubleshooting

### Common Issues

**Issue**: Database not loading
- **Solution**: Check file size limits, verify MIME types in `vercel.json`

**Issue**: Authentication failing
- **Solution**: Verify environment variables are set in Vercel

**Issue**: WASM not loading
- **Solution**: Check Content-Type header for `.wasm` files

**Issue**: Slow initial load
- **Solution**: Database is large (~17.7 MB), consider showing loading indicator

### Debug Mode

Enable debug logging:

```javascript
// In app.js
console.log('Database loaded:', db);
console.log('Query results:', results);
```

## Security Checklist

- [ ] Environment variables set in Vercel (not in code)
- [ ] MongoDB IP whitelist configured
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] User approval workflow enabled
- [ ] Password hashing enabled (bcrypt)

## Rollback

To rollback to a previous deployment:

1. Go to Vercel dashboard
2. Navigate to "Deployments"
3. Find the previous working deployment
4. Click "Promote to Production"

Or via CLI:

```bash
vercel rollback
```

## Custom Domain

To add a custom domain:

1. Go to Vercel dashboard → Settings → Domains
2. Add your domain
3. Configure DNS records as instructed
4. Wait for DNS propagation (up to 48 hours)

## Related Documentation

- [Web Interface](./04-web-interface.md) - Frontend architecture
- [API Documentation](./05-api.md) - API endpoints
- [Database Schema](./03-database-schema.md) - Data structure
