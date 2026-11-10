# QuickList AI

Standalone, mobile-first AI listing assistant for used motorsports parts. Separate from RaceIQ.

## Product requirements
- Photograph one or more used racing parts from an iPhone.
- AI proposes item identification, searchable title, description, category and item specifics; clearly mark unknown details for human verification.
- Seller selects auction or fixed-price Buy It Now; AI may recommend based on verified comparable market data.
- Support Best Offer on eligible fixed-price listings.
- Default auction duration: 7 days.
- Default shipping: calculated shipping paid by buyer, requiring package dimensions and weight.
- Save and edit drafts; require seller confirmation before publishing.
- Future: eBay OAuth and compliant listing/publishing integration, comparable pricing, inventory and sales tracking.
- Never expose eBay tokens or AI keys in client code. Do not claim eBay publishing works until it is integrated and tested.

## Stack
Next.js / TypeScript, deploy to Vercel, Supabase for data and private image storage. This is a project specification; app implementation is next.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no environment values, the application runs in **demo mode**: generation returns a clearly marked sample template, not image recognition. Drafts and compressed photos save in this browser's localStorage. Browser storage is limited; clearing site data removes these drafts. Export reviewed draft downloads listing details as JSON (photos are retained in the saved draft, not embedded in the export).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Optional for browser-only demo. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project key protected by RLS; configure together with URL. |
| `OPENAI_API_KEY` | Server-only key. Enables real photo proposals; never prefix with NEXT_PUBLIC. |
| `OPENAI_MODEL` | Optional vision-capable model, defaults to `gpt-4.1-mini`. |

Live AI requires both Supabase configuration and a signed-in user. AI errors remain errors, and never silently produce a demo identification. Unknown identification, condition and compatibility must be verified by the seller. No market data or price recommendation is fabricated.

## Private Supabase setup

1. Create a Supabase project. Run `supabase/setup.sql` once in the SQL editor on a fresh project. It creates the drafts table, owner-only row policies, and private `part-photos` bucket with owner-folder policies. No service-role key is required.
2. Enable email authentication. Set Auth Site URL to your deployed origin and add local/deployed origins to permitted redirect URLs. Configure production email delivery for reliable magic links.
3. Set the two public environment variables above. Sign in using an emailed link. Signed-in saves upload photos privately under `<user-id>/<draft-id>/<random-id>.jpg`; draft JSON contains private paths. Reads use authenticated downloads rather than public URLs.
4. Verify access with two test accounts: account A saves a draft and photos, account B must not be able to read or update A's rows or download A's photos. Anonymous clients must have no access. These live checks require your project and have not been run in the credential-free demo environment.

Browser drafts are not automatically migrated to cloud storage. Open one before sign-in and explicitly save it to your account if needed. Cloud writes create new photo objects; superseded uploads can remain in storage. Add retention/cleanup before larger-scale use. Photos are compressed in-browser (up to 1200 px, 4 photos, combined encoded payload under 3.5 MB); HEIC is not accepted, so use JPEG/compatible capture on iPhone.

## Deploy on Vercel

Import this GitHub repository into Vercel, select **Next.js**, and use the default build (`npm run build`). Set the needed environment variables in Vercel, deploy, then update Supabase redirect origins. Redeploy after changing public variables. `app/api/analyze` uses the Node runtime and a 60-second maximum function duration; ensure your plan supports it. Restrict production access/usage and configure a gateway or platform rate limit and provider budget before opening paid AI usage to the public. Authentication is required but this initial version does not implement persistent usage quotas.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

The browser test covers the iPhone-width demo photo-to-draft workflow, auction defaults, Best Offer eligibility, positive package measurements, seller confirmation, saved draft/photo recovery, and horizontal overflow. Server credentials are not needed for demo tests. Real AI and hosted Supabase require separate integration checks with configured credentials.

## Current boundaries

This version prepares, saves, and exports drafts. **It does not publish to eBay**, calculate carrier rates, retrieve comparable sales, or track inventory/sales. The seller must confirm details before export, and editing a reviewed draft clears that confirmation. A future publishing integration must independently validate seller confirmation and all listing fields server-side before any marketplace write.
