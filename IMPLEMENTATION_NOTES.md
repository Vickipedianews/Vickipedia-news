# Design and infrastructure decisions

**Brand:** The original publication's asset filename is `brand-logo.jpeg`. Do not substitute an invented symbol. All newsroom icons now use Fluent UI System Icons SVG assets, including admin navigation and composer tools. Selected icons are loaded from a version-pinned SVG icon library CDN. For production, copy the required SVG assets locally.

**Composer:** An offline-first structured document editor uses `contenteditable` (not Tiptap v3) for a structured ProseMirror document, collaborative-friendly semantics, keyboard editing, media nodes, link marks and a slash menu. Existing plaintext article bodies continue to display. Structured JSON is rendered by a restricted serializer, keeping raw HTML out of reader pages.

**Database:** Neon Postgres is the right primary store on Vercel: authors, publications, articles, categories, access control, subscriptions and metadata belong in a relational database. SQLite is retained for local development with a separate runtime. Both models use the same client-facing REST endpoints.

**Files:** Media bytes live in Vercel Blob or Cloudflare R2/S3, never in Postgres. Keep image/video URLs and metadata in the DB. Small files can pass through the server; large files use authenticated direct-to-object-storage uploads.

**Production gaps:** Neon and Vercel Blob/R2 require a live staging deploy and migration review. Multi-user roles and reusable media catalog are implemented; revision history, responsive image variants, video transcoding, asset lifecycle policies, a real-time collaboration layer, MFA, and a complete accessibility audit are not included.
