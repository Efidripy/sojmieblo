# Sojmieblo Newcomer Guide

## 1) What this project is
Sojmieblo is a small full-stack app for real-time face/image deformation in the browser using WebGL.

- Frontend: vanilla JS + `glfx.js` + Canvas.
- Backend: Express API for saving/deleting/listing processed works.
- Storage: local filesystem (`works/` + `works/thumbs/`).

## 2) Repo structure at a glance
- `public/` — browser app (UI, deformation interactions, gallery sidebar).
- `server.js` — Express server and API routes.
- `utils/imageConverter.js` — image conversion/thumbnail pipeline (Sharp).
- `utils/fileManager.js` — persistence, metadata, cache, cleanup.
- `tests/fileManager.test.js` — Jest unit tests for storage/caching behavior.
- `TECHNICAL.md` — deployment and operations runbook.
- `install.sh`, `deploy_sojmieblo.sh`, `prepare-release.sh` — install/deploy/release scripts.

## 3) Runtime architecture and request flow
1. User uploads an image in `public/app.js`.
2. Frontend validates MIME/size via `public/config.js`, creates a preview via `public/imageProcessor.js`.
3. Deformation happens in WebGL canvas (`glfx.js`) and the user can save.
4. `public/workManager.js` exports current canvas pixels to JPEG data URL and calls `POST /api/save-work`.
5. Server validates payload size/type in `server.js`, converts image and creates thumbnail via `ImageConverter`.
6. `FileManager.saveWork()` persists image + thumbnail + metadata JSON.
7. Gallery UI fetches `/api/works` and renders thumbnails/actions.

## 4) API endpoints you should know first
From `server.js`:
- `POST /api/save-work` — save a new processed image.
- `GET /api/works` — list all saved works.
- `GET /api/works/:id` — metadata for one work.
- `GET /api/works/:id/image` — full image stream.
- `GET /api/works/:id/thumbnail` — thumbnail stream.
- `GET /api/works/:id/download` — image download.
- `DELETE /api/works/:id` — remove a work.
- `GET /api/stats` — storage stats.

## 5) Important implementation details
- Body size limits are intentionally larger server-side (`50mb`) than frontend binary upload cap (`30MB`) because data URLs inflate payload size.
- Works listing in `FileManager` is cached in memory with TTL (default 10s) and invalidated on save/delete.
- Auto-cleanup deletes old works periodically (default check hourly; remove older than 7 days when started by server).
- `workManager.js` uses `gl.readPixels` + vertical flip to export the *actual* current WebGL frame reliably.

## 6) Local development workflow
- Install deps: `npm install`
- Run app: `npm start` (or `npm run dev`)
- Run tests: `npm test`

## 7) What to learn next (best onboarding path)
1. **Frontend interaction path**: read `public/index.html` → `public/app.js`.
2. **Persistence path**: read `server.js` save/list/delete handlers + `utils/fileManager.js`.
3. **Image pipeline**: read `utils/imageConverter.js` to understand JPEG conversion and thumbnail generation.
4. **Performance constraints**: review preview scaling in `public/imageProcessor.js` and upload/body limits in `public/config.js` + `server.js`.
5. **Operations**: skim `TECHNICAL.md` for deployment (Nginx/body-size/systemd) and troubleshooting.

## 8) First safe contributions for a newcomer
- Add tests around edge cases (invalid metadata, corrupted JSON, cleanup timing).
- Improve user-facing error messages in `public/workManager.js` and `public/app.js`.
- Add API contract docs/examples (request+response payloads) under `TECHNICAL.md`.
- Refactor comments/language consistency (currently mixed Russian/English).
