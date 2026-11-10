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
