# Contributor accounts and reusable media library

## Access model
- Administrator: manage newsroom accounts, site settings, contributors, articles and media.
- Editor: manage editorial content and video/media, but not account provisioning or publication settings.
- Author: has their own email/password login, sees their assigned articles, creates private drafts, can upload/select media, and cannot publish. Admin creates the login and links it to the public author profile. Author can change their own password in Studio.
- There is no open registration. Accounts are provisioned by an admin, and passwords are hashed with scrypt. Share an initial password securely and have the contributor change it.

## Reusable assets
- Uploaded images and MP4/WebM files are recorded in `media_assets` in SQLite and Neon.
- Gallery supports search and filtering, image/video previews, selecting media for the article editor, and editing title/alt text.
- Removing an asset from the library does NOT delete the underlying file. This avoids breaking published stories.
- Vercel Blob or R2 is recommended for durable production uploads; local files remain the dev fallback.
- Publishing a YouTube/Vimeo link is still supported through the Video library records, separately from hosted media files.

## Deployment
Run `npm run build` with valid Neon connection variables and a working Blob/R2 provider. This applies migration 004 after prior migrations. Never commit `.env` credentials. Test with a staging Neon branch before migrating production.

## Caveats
No invite-email delivery, password-reset emails, transactional email, video transcoding, waveform generation, storage scanning, or media reference garbage collection is included. UI and local workflows need final staging QA against deployed Neon/Blob.
