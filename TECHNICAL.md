# Technical Documentation - Sojmieblo

## Architecture Overview

Sojmieblo is a real-time face deformation web application built with a modern client-server architecture:

- **Frontend**: Vanilla JavaScript, WebGL (glfx.js), Canvas API
- **Backend**: Node.js, Express, Sharp (image processing)
- **Data Storage**: File-based (works directory)

## Technical Stack

### Backend Dependencies
- `express` (^4.18.2) — Web framework
- `express-rate-limit` (^6.7.0) — API rate limiting
- `sharp` (^0.33.2) — Image processing and optimization
- `uuid` (^9.0.1) — Unique identifier generation

### Frontend Technologies
- **WebGL** via glfx.js for GPU-accelerated deformations
- **Canvas API** for image rendering and brush overlay
- **Vanilla JavaScript** (ES6+) — no framework dependencies

## Server Configuration

### Express.json Body Size Limit

The server is configured with a `50MB` body size limit:
```javascript
app.use(express.json({ limit: '50mb' }));
```

**Why 50MB when frontend limit is 30MB?**
- Frontend limit: 30MB for binary image files (CONFIG.upload.maxFileSize)
- Base64 encoding overhead: ~33% increase (30MB binary → ~40MB base64)
- Server limit: 50MB to safely handle base64-encoded images with buffer for HTTP headers and metadata
- This prevents "request entity too large" errors while maintaining reasonable upload limits

### Rate Limiting

The API is protected with rate limiting:
- **Limit**: 100 requests per 15 minutes per IP
- **Endpoints**: All `/api/*` routes
- **Configuration**: Located in `server.js`

```javascript
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
```

## Nginx Reverse Proxy Configuration

When deploying with Nginx as a reverse proxy, you **must** configure `client_max_body_size` to match or exceed the application's upload limits.

### Required Nginx Configuration

Add to your server block in `/etc/nginx/sites-available/sojmieblo`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Critical: Set client body size limit to 30MB (matches frontend limit)
    client_max_body_size 30M;
    
    # Serve static files directly
    location / {
        root /var/www/sojmieblo;
        index index.html;
        try_files $uri $uri/ =404;
    }
    
    # Proxy API requests to Node.js backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Critical: Allow large uploads (must match or exceed client_max_body_size)
        client_max_body_size 30M;
        
        # Timeouts for large uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### Apply Nginx Configuration

```bash
# Test configuration syntax
sudo nginx -t

# Reload Nginx to apply changes
sudo systemctl reload nginx

# If reload fails, restart
sudo systemctl restart nginx
```

## Deployment

### Directory Structure

**Production deployment uses split directories:**
- `/opt/sojmieblo/` — Backend (Node.js server)
- `/var/www/sojmieblo/` — Frontend (static files)

### Deployment Commands

**Option 1: Quick frontend update (rsync)**
```bash
# Sync frontend files to web root
rsync -av --delete public/ /var/www/sojmieblo/

# Restart backend if needed
sudo systemctl restart sojmieblo
```

**Option 2: Full backend update**
```bash
# Navigate to backend directory
cd /opt/sojmieblo

# Pull latest changes
git pull origin main

# Install/update dependencies
npm install --production

# Restart service
sudo systemctl restart sojmieblo
```

**Option 3: Combined update (backend + frontend)**
```bash
cd /opt/sojmieblo
git pull origin main
npm install --production
rsync -av --delete public/ /var/www/sojmieblo/
sudo systemctl restart sojmieblo
```

### Service Management

The application runs as a systemd service:

```bash
# Check status
sudo systemctl status sojmieblo

# View logs (real-time)
sudo journalctl -u sojmieblo -f

# View recent logs
sudo journalctl -u sojmieblo -n 100

# Restart service
sudo systemctl restart sojmieblo

# Stop service
sudo systemctl stop sojmieblo

# Start service
sudo systemctl start sojmieblo

# Enable service on boot
sudo systemctl enable sojmieblo
```

## Frontend Configuration

All frontend configuration is in `public/config.js`:

### Upload Settings
```javascript
upload: {
    maxFileSize: 30 * 1024 * 1024,  // 30MB
    acceptedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
    enableDragAndDrop: true,
    enableClipboard: true
}
```

### Deformation Parameters
```javascript
deformation: {
    defaultBrushRadius: 100,        // Default brush size (pixels)
    minBrushRadius: 20,             // Minimum brush size
    maxBrushRadius: 300,            // Maximum brush size
    brushRadiusStep: 10,            // Scroll wheel step size
    initialStrength: -0.5,          // Initial pinch strength (negative = pinch)
    minStrength: -1.5,              // Maximum pinch strength
    strengthIncreaseRate: 0.5,      // Strength increase per second (hold)
    updateInterval: 50              // Update interval (ms)
}
```

### Preview Sizes
```javascript
preview: {
    sizes: [
        { name: '4K', width: 1920, minWindowWidth: 1920 },
        { name: '2K', width: 1440, minWindowWidth: 1440 },
        { name: 'FHD', width: 1280, minWindowWidth: 1280 },
        { name: 'HD', width: 720, minWindowWidth: 0 }
    ]
}
```

## Troubleshooting

### Issue: "Request entity too large" on upload

**Causes:**
1. Nginx `client_max_body_size` too small
2. Express.json limit too small

**Solution:**
```bash
# 1. Update Nginx config
sudo nano /etc/nginx/sites-available/sojmieblo
# Add: client_max_body_size 30M;

# 2. Test and reload
sudo nginx -t
sudo systemctl reload nginx

# 3. Verify Express.json limit in server.js
# Should be: express.json({ limit: '50mb' })
```

### Issue: Service won't start

**Check logs:**
```bash
sudo journalctl -u sojmieblo -n 50
```

**Common causes:**
- Port 3000 already in use
- Missing dependencies
- Permission issues with works directory

**Solutions:**
```bash
# Check port usage
sudo lsof -i :3000

# Reinstall dependencies
cd /opt/sojmieblo
npm install

# Fix permissions
sudo chown -R www-data:www-data /opt/sojmieblo/works
```

### Issue: WebGL not working

**Client-side issue:**
- Browser doesn't support WebGL
- Hardware acceleration disabled
- Graphics drivers outdated

**Check WebGL support:**
Visit: https://get.webgl.org/

### Issue: Images not saving

**Check:**
1. Disk space: `df -h`
2. Works directory permissions: `ls -la /opt/sojmieblo/works`
3. Backend logs: `journalctl -u sojmieblo -f`

**Fix permissions:**
```bash
sudo mkdir -p /opt/sojmieblo/works
sudo chown -R www-data:www-data /opt/sojmieblo/works
sudo chmod 755 /opt/sojmieblo/works
```

### Issue: Deformation not persisting on save

**Cause:** GPU render buffer not flushed before reading pixels

**Fix:** Ensure `workManager.js` calls `gl.finish()` before `gl.readPixels()`:
```javascript
const gl = canvasElement._.gl;
gl.finish();  // Wait for GPU to finish rendering
gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
```

### Issue: Brush overlay not aligned with canvas

**Cause:** CSS dimensions not matching canvas dimensions

**Fix:** Ensure `app.js` sets both canvas dimensions and CSS sizes:
```javascript
brushOverlay.width = canvas.width;
brushOverlay.height = canvas.height;
brushOverlay.style.width = rect.width + 'px';
brushOverlay.style.height = rect.height + 'px';
```

## Performance Optimization

### Image Preview System

The application uses adaptive preview sizes based on viewport:
- **4K+ displays**: 1920px preview
- **2K displays**: 1440px preview  
- **FHD displays**: 1280px preview
- **HD displays**: 720px preview

This reduces memory usage and improves WebGL performance on lower-end devices.

### WebGL Deformation

- **GPU-accelerated**: All deformations run on GPU via glfx.js
- **Real-time**: 60 FPS target with `bulgePinch` shader
- **No accumulation**: Deformations apply to original texture (not previous state)

### Rate Limiting Strategy

- **Per-IP limiting**: Prevents abuse from single sources
- **Generous limits**: 100 requests per 15 minutes allows normal usage
- **Endpoint-specific**: Only API routes are limited (static files unrestricted)

## Security Considerations

### Input Validation

**File uploads:**
- Type validation: Only image MIME types allowed
- Size validation: 30MB client-side + 50MB server-side limit
- Content validation: Sharp library validates image data

**Rate limiting:**
- Prevents DoS attacks
- Protects against brute force
- Limits resource consumption

### Data Privacy

- **No permanent storage**: Works can be deleted by users
- **No user accounts**: No personal data collection
- **Local processing**: Image deformation happens client-side (WebGL)

## Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/Efidripy/sojmieblo.git
cd sojmieblo

# Install dependencies
npm install

# Start development server
npm start

# Access application
# Open http://localhost:3000
```

### Development Tips

1. **Frontend changes**: Just reload browser (no server restart needed)
2. **Backend changes**: Restart server with `npm start`
3. **Testing uploads**: Use small images first (<1MB)
4. **Console debugging**: Open browser DevTools → Console for errors

### Code Structure

```
sojmieblo/
├── public/                 # Frontend
│   ├── index.html         # Main page
│   ├── app.js             # Main application logic
│   ├── workManager.js     # Work saving/loading
│   ├── imageProcessor.js  # Image preview handling
│   ├── config.js          # Configuration
│   ├── styles.css         # UI styles
│   └── glfx.js            # WebGL library
├── server.js              # Express backend
├── utils/                 # Server utilities
│   └── rateLimitConfig.js
├── works/                 # Saved works storage
└── package.json           # Dependencies
```

## API Reference

### POST /api/save-work

Save deformed image.

**Request:**
```json
{
  "image": "data:image/jpeg;base64,...",
  "metadata": {
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-31T12:00:00.000Z"
  }
}
```

**Response:**
```json
{
  "work": {
    "id": "uuid-v4",
    "createdAt": "2024-01-31T12:00:00.000Z"
  }
}
```

**Rate limit:** 100 requests per 15 minutes

### GET /api/works

List all saved works.

**Response:**
```json
{
  "works": [
    {
      "id": "uuid-v4",
      "createdAt": "2024-01-31T12:00:00.000Z"
    }
  ]
}
```

### GET /api/works/:id/download

Download work image.

**Response:** JPEG image file

### GET /api/works/:id/thumbnail

Get work thumbnail.

**Response:** Resized JPEG image (300px wide)

### DELETE /api/works/:id

Delete a work.

**Response:**
```json
{
  "message": "Work deleted successfully"
}
```

## Monitoring

### Health Check

Simple health check:
```bash
curl http://localhost:3000/api/works
```

Should return JSON with works array.

### Log Analysis

**View error logs:**
```bash
sudo journalctl -u sojmieblo -p err -n 50
```

**View access patterns:**
```bash
sudo journalctl -u sojmieblo | grep "POST /api/save-work"
```

**Monitor rate limiting:**
```bash
sudo journalctl -u sojmieblo | grep "rate limit"
```

## Production Checklist

Before deploying to production:

- [ ] Node.js 18+ installed
- [ ] Dependencies installed (`npm install --production`)
- [ ] Works directory created with correct permissions
- [ ] Systemd service configured and enabled
- [ ] Nginx reverse proxy configured with `client_max_body_size 30M`
- [ ] Nginx configuration tested (`nginx -t`)
- [ ] Firewall rules configured (allow port 80/443)
- [ ] SSL certificate installed (recommended)
- [ ] Service starts successfully (`systemctl status sojmieblo`)
- [ ] Frontend files deployed to `/var/www/sojmieblo/`
- [ ] Rate limiting tested and working
- [ ] Image upload tested (small and large files)
- [ ] WebGL functionality tested in target browsers

## Changelog

### Recent Changes (Current PR)

**Frontend Fixes:**
- ✅ Left-click only resets deformation (ignores right/middle clicks)
- ✅ Click must be inside canvas bounds to reset (UI clicks don't reset)
- ✅ Deformation preserved on save (gl.finish() before readPixels)
- ✅ Brush overlay perfectly synced with canvas (CSS + canvas dimensions)
- ✅ Brush center enhanced with white gradient for better visibility
- ✅ Control buttons prevent event bubbling (stopPropagation)
- ✅ Upload limit increased to 30MB (from 10MB)

**UI Improvements:**
- ✅ Control buttons moved to top-left as compact mini-buttons
- ✅ Parameters moved to top-right corner
- ✅ Responsive design for mobile devices
- ✅ Improved touch interactions

**Documentation:**
- ✅ README.md cleaned up (marketing focus)
- ✅ TECHNICAL.md added (comprehensive technical guide)

## Support

For issues, feature requests, or contributions:
- **GitHub**: https://github.com/Efidripy/sojmieblo
- **Issues**: https://github.com/Efidripy/sojmieblo/issues

## License

MIT
