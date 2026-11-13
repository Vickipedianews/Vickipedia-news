# Vickipedia News / Vickipedia Studio

A newspaper-style publishing platform, preserving the original Vickipedia News branding and extending the editorial workspace.

## Quick start — no external services

Requirements: Node.js 22.13+.

```bash
npm start
```

- Public publication: http://localhost:3000
- CMS: http://localhost:3000/admin
- First CMS visit creates the administrator account (minimum 8-character password).
- Default development storage: SQLite at `data/blog.sqlite` and image/video files under `uploads/`.

The development mode uses only built-in Node.js packages. The editor is bundled locally as a dependency-free, `contenteditable`-based rich-text composer. **It is not Tiptap**: CDN-delivered Tiptap was removed after its duplicate-plugin failure, and installing an actual bundled Tiptap distribution is a separate step when package-registry access is available. The current composer works without a CDN and stores an allowlisted ProseMirror-compatible JSON document. Do not use SQLite or local uploads on Vercel Functions: the runtime filesystem is ephemeral.

## THE ORIGINAL LOGO

The uploaded original `index 2.html` used `background-image:url(brand-logo.jpeg)`, but **the actual `brand-logo.jpeg` file was not included**. We have not generated or replaced the logo. Either:

- Put the original image at `public/brand-logo.jpeg` **before starting the app**, or
- Upload the real image in **Studio → Publication settings → Logo**, then save. This also works with Vercel Blob or S3/R2 storage.

In the absence of the original image, a text-only Vickipedia wordmark appears. There is no fake substitute graphic.

## Editor

The bundled composer uses native browser editing operations and stores a **ProseMirror-compatible structured JSON document** in `articles.body`. The reader renders an allowlist of document nodes and marks, rather than trusting raw HTML. Existing plain-text/Markdown stories remain readable and are converted when opened in the editor. Editor features include bold, italic, headings, lists, quotes, link editing, undo/redo, slash commands, image insertion from a file, paste or drop, YouTube embedding, uploaded MP4/WebM blocks, preview, word counts and local session recovery.

The composer itself does not need internet access. Production editor controls should eventually migrate to a locally bundled Tiptap/ProseMirror implementation for better selection handling, collaborative editing and complex undo behaviour. Fluent SVG icons and optional Google Fonts currently request remote resources; the application has font and text fallbacks.

## Neon PostgreSQL (recommended for Vercel)

The project contains a PostgreSQL server implementation (`server-pg.js`) alongside the SQLite development server (`server.js`). This path is intended for Neon. It requires dependencies, a working connection string and integration testing against your specific Neon project.

1. In Vercel, fix any **Needs Attention** database variables through the Neon integration, then confirm a working `DATABASE_URL` (pooled). Use `DATABASE_URL_UNPOOLED` for future migration tooling. Do not paste credentials into source code.
2. Install dependencies with `npm install`.
3. To exercise the PostgreSQL backend locally, set `DATABASE_URL` using a local `.env`-loading shell or `vercel env pull .env.local`, then launch:

```bash
DATABASE_URL='postgresql://...' MEDIA_STORAGE=local npm run start:postgres
```

4. For the deployed Vercel project, the `api/index.js` serverless entrypoint and `vercel.json` rewrites use `server-pg.js`. Set `MEDIA_STORAGE=vercel-blob` or `MEDIA_STORAGE=s3` for durable uploads, and set `SITE_URL=https://your-domain.example` for canonical URLs.

**Important deployment caveat:** Vercel Functions and the Neon path have only passed source-level checks, not a live Vercel/Neon end-to-end deploy; review function packaging/rewrites and complete staging deployment tests before production use. The PostgreSQL initializer currently creates tables and seeds records on boot as a bootstrap convenience; for a production newsroom, move this into versioned, one-time migrations and disable automatic seeds.

## Media providers

Set `MEDIA_STORAGE` explicitly:

| Value | Required environment | Notes |
| --- | --- | --- |
| `local` (default without Blob token) | None | Development only; uploaded files in `uploads/`, individual upload maximum 6 MB |
| `vercel-blob` | `BLOB_READ_WRITE_TOKEN` | Small files via server SDK; larger files via browser direct uploads and authenticated upload tokens (up to 250 MB) |
| `s3` | `S3_BUCKET`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Browser uploads through short-lived signed PUT URLs; requires bucket CORS for your domain |

For Cloudflare R2 you can use aliases `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; set `S3_PUBLIC_BASE_URL` to your public R2 custom domain or R2 dev URL. `S3_REGION` defaults to `auto`. The S3/R2 path expects public delivery, so configure a valid read URL or CDN. Large video files should be uploaded directly to object storage, not through a Vercel Function.

### Safety and operations

- The server only issues authenticated upload credentials and uses constrained media types and sizes.
- Vercel Blob callbacks are validated by the SDK; only authenticated admins can request upload tokens.
- Never expose raw database passwords, S3 access keys or Blob read/write tokens in the frontend.
- Verify MIME types and scan uploaded assets in production; limit rate and storage usage per account.
- Configure CORS only for your actual production and development origins for direct S3/R2 uploads.
- Establish migrations, content backups, restore tests, logging, error monitoring and production access policies before public launch.
- Build and test a first-party bundled Tiptap editor before relying on this system offline or in a restrictive CSP environment.

## Commands

```bash
npm start                  # SQLite + local uploads
npm run start:postgres     # PostgreSQL backend (DATABASE_URL required)
npm run check              # JavaScript syntax checks
```

## What's not included

A distributed publishing workflow with approvals, revision history, scheduled publishing, object lifecycle cleanup, image transforms, media transcoding, browser-based visual regression tests, and fine-grained editorial roles needs additional engineering. This release implements the groundwork, not those features.

## November 2026 editorial redesign

The site now uses a content-first editorial design (Newsreader display typography, Source Serif 4 reading typography, Inter UI typography, warm neutral surfaces and restrained violet accent). The original logo upload workflow is retained; because the original image was not supplied, no replacement logo is invented. Homepage content is not repeated into one-story category blocks. The CMS has a focused story canvas with a separate metadata/publishing inspector, structured rich-text formatting, and a working offline editing fallback.

**Visual QA:** Browser scripting was exercised with mocked API data at desktop (1440px) and mobile (390px) widths, with no runtime exceptions or horizontal overflow in those renderings. Network navigation into localhost is restricted in the available browser environment, so a production-domain browser regression test is still needed. The backend HTTP publishing tests were also run against local SQLite.


## Contributors and multi-author articles

Vickipedia Studio → **Contributors** manages individual author profiles, including their name, role, biography, portrait and public social URLs. Each contributor has a public page at `/author/<slug>` listing every article they have contributed to.

When editing a story, use **Byline contributors** in the publishing inspector. Select multiple authors and use the ↑/↓ controls to set their display order. The first contributor becomes the lead author; all selected contributors are credited and linked to their profiles on the article page. The first selected author remains available as `author_id` for older API clients. The many-to-many associations are stored in `article_authors`, and previous stories are migrated automatically from their existing author assignment on startup.

Both SQLite and Neon/PostgreSQL support this migration. Authors can co-write an unlimited number of stories; the UI/API cap individual story attribution at 12 contributors. Publishing remains restricted to authenticated CMS administrators; contributor profiles are not independent login accounts.

## Production bootstrap security
Set `CMS_SETUP_TOKEN` to a **random 24+ character secret** in Vercel before deploying. On first visit to `/admin`, the setup screen asks for this token alongside the initial administrator email/password. Development mode does not require it. Do not expose the setup secret publicly or bundle it into browser JavaScript. Once an administrator exists, public setup is permanently disabled.

## Multi-account and media gallery upgrade
`Studio → Team accounts` provisions individual admin, editor and author logins. Author accounts link to an existing Contributor profile, create private drafts and may edit their own unpublished stories. They cannot publish or edit other authors' articles. Editors publish stories and manage the content library. All accounts can update their own passwords, and linked authors can edit their public biography and portrait.

`Studio → Media gallery` catalogs uploaded images and hosted video files. The separate `Video library` is now a visual gallery for recorded video stories, including YouTube/Vimeo links. In the article composer, use **Library** to insert previously uploaded files or a saved video record. Metadata is persisted in the database; files live in Blob/R2 or local storage for development. The new tables and account role fields are handled by migration `004_accounts_media.sql` in Neon and automatically upgraded in local SQLite.
