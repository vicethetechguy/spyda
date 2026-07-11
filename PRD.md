# Spyda Product Requirements Document

## 1. Product Summary

Spyda is an AI design reconstruction workspace that helps users transform an uploaded flyer or graphic design into a structured design web, edit selected design atoms, and generate premium-quality new flyers that preserve the reference layout.

The core promise is simple: upload a reference design, let Spyda dissect it into editable atoms, choose a small number of focused changes, and generate a new design that keeps the original visual structure while applying the user's replacement content and brand constants.

Spyda is not a generic image generator. It is a reference-guided design editing system.

## 2. Product Vision

Spyda should become the easiest way for creators, marketers, founders, agencies, and small businesses to turn existing visual references into controlled, premium design variations without needing Photoshop-level skill.

The long-term vision is broader than flyers. Spyda should eventually break down and reconstruct:

- Flyers
- Social media graphics
- Posters
- Ads
- Thumbnails
- Banners
- Product promos
- Brand campaign visuals
- Other structured graphic designs

The product name "Spyda" comes from the design web concept: the uploaded design sits at the center, while every detected design atom connects outward like a web.

## 3. Target Users

### Primary Users

- Social media designers who need fast design variations.
- Agencies creating campaign assets for clients.
- Small business owners who have references but cannot design from scratch.
- Creators who want premium graphics without learning complex design software.
- Marketing teams that need brand-consistent creative assets.

### Secondary Users

- Freelance designers who want to speed up production.
- Startup founders creating quick product announcements.
- Non-designers who need editable design structure from visual references.

## 4. Core Problem

Users often have a flyer or graphic design they like, but they do not have the editable source file. They want to reuse the layout, style, and premium feel while changing selected text, logos, images, offers, colors, or brand details.

Traditional tools are difficult because:

- Static image files are not editable.
- Rebuilding designs manually takes time.
- AI image generators often redesign instead of preserving the reference.
- Generated designs often change layout, crop important elements, resize logos, or ignore brand details.
- Users do not want to prompt everything from scratch.

Spyda solves this by creating a guided workflow between the user, the extracted design atoms, and GPT-Image 2.

## 5. Product Goals

### MVP Goals

- Allow users to upload a reference flyer or design.
- Analyze the uploaded design using AI vision and OCR.
- Break the design into editable atoms.
- Show a visual source and child-source workflow.
- Allow users to select exactly 3 focused changes per generation round.
- Apply brand constants globally on every generation.
- Generate new flyers with GPT-Image 2.
- Preserve the source layout as closely as possible.
- Let the latest generated flyer become the new parent source for the next edit round.
- Allow downloads of generated designs.

### Product Quality Goals

- Generated designs should feel premium and close to the uploaded reference.
- Replacement text should stay inside the original text region.
- Replacement logos/images should match the size and position of the original asset.
- Brand constants should affect the design style but must not corrupt uploaded logos, photos, QR codes, app badges, or product screenshots.
- Users should understand what Spyda is doing at each stage.

## 6. Non-Goals

For the current product phase, Spyda will not:

- Provide full Photoshop-style manual layer editing.
- Guarantee perfect pixel-level reconstruction from every uploaded raster image.
- Convert any flyer into a true vector or PSD file.
- Support unlimited simultaneous changes in one generation round.
- Replace professional design judgment for complex campaigns.
- Allow direct freeform painting or masking tools.

## 7. Key Concepts

### Source Card

The Source card displays the current parent design for the generation round.

On the first round, the Source is the uploaded reference flyer. After the first generation, the latest generated child becomes the new Source for the next round. This lets users keep editing forward instead of starting from the original upload each time.

### Child Source Card

The Child Source card hosts the newest generated design. It is the output of the current generation round.

### Design Atoms

Design atoms are the individual visible components detected from the flyer:

- Headlines
- Subheadlines
- Logos
- Main subjects
- Product images
- App screenshots
- Notification cards
- CTA buttons
- QR codes
- Contact details
- Social handles
- Decorative shapes
- Background blobs
- Gradients
- Shadows
- Icons
- Footer details

### Brand Constants

Brand constants are always-on rules that apply to every generation:

- Heading font
- Body font
- Primary color
- Secondary color
- Accent color
- Visual style
- Essentials

Brand constants do not count as part of the 3-change rule.

### Essentials

Essentials are user-supplied instructions or assets that the AI must obey. They are counted as part of the 3-change rule when used in a generation round.

### 3-Change Rule

Each generation round should contain exactly 3 focused changes. These may come from:

- 3 design atom edits
- 2 design atom edits + 1 Essential prompt
- 1 design atom edit + 2 Essential prompts
- 3 Essential prompts

The goal is to reduce prompt overload and improve reference accuracy.

## 8. User Journey

### 8.1 Landing Page

Users arrive on a premium landing page that explains:

- What Spyda does.
- How reference-guided design works.
- Why it preserves design structure.
- How credits/pricing work.
- How to sign up or sign in.
- That Spyda is built by Vigency.

### 8.2 Authentication

Users can sign up, sign in, access account settings, and manage their profile.

### 8.3 Upload

Users upload a flyer or design file. Spyda displays the upload in the workspace and prepares it for analysis.

### 8.4 Analysis

Spyda analyzes the design using:

- GPT-4o or selected OpenAI analysis model
- Groq vision analysis when selected
- Google Vision OCR for text extraction

The output is a structured design breakdown.

### 8.5 Design Web

Spyda displays the uploaded flyer as the Source and creates atom cards for detected components. The experience should feel like a web of connected design components.

### 8.6 Editing Round

The user chooses exactly 3 changes. The user can:

- Edit text atoms.
- Upload replacement images.
- Upload replacement logos.
- Add Essential prompts.
- Set brand constants.
- Choose output size.

### 8.7 Generation

Spyda sends a compact structured recipe to GPT-Image 2:

- Active parent Source
- Current Child Source
- Selected atoms
- Replacement text/assets
- Brand constants
- Layout lock map
- Protected asset rules

GPT-Image 2 returns a new child flyer.

### 8.8 Continue Editing

After generation, the new child flyer becomes the active Source for the next round. Used atoms are removed from the Design Atoms list unless the user adds a correction through Essentials.

### 8.9 Download

The user can download the generated flyer.

## 9. Functional Requirements

### 9.1 Upload and Preview

- Users can upload common image formats.
- Uploaded images must preview immediately.
- The app should capture original dimensions and aspect ratio.
- The app should preserve the output aspect ratio by default.

### 9.2 Analysis

- The app must extract visible text using OCR.
- The app must identify major visual regions.
- The app must generate 16 to 35 atoms for complex flyers when possible.
- The app must include tiny footer text, logos, icons, social handles, QR codes, badges, and decorative elements.
- The app must repair malformed AI JSON responses where possible.

### 9.3 Design Atom Cards

- Each atom card must show the atom name, type, current content, and replacement control.
- Text atoms should provide editable text fields.
- Image/logo atoms should provide upload controls.
- Atom cards should be removable.
- Removed atoms must not be included in future generation recipes.

### 9.4 Brand Constants Card

- Users can set heading font.
- Users can set body font.
- Users can set primary, secondary, and accent HEX colors.
- Users can choose visual style.
- Users can add Essentials prompts.
- Users can upload an Essentials reference image.
- Brand constants must always be included in generation.

### 9.5 Generation Rules

- Users must provide exactly 3 focused changes per generation round.
- Brand constants apply globally and do not count as one of the 3 changes.
- GPT-Image 2 must use the active Source as the current parent layout.
- Replacement text must fit the original parent text box.
- Replacement logos must match the original logo size and placement.
- Replacement images must inherit the original atom's visible scale, crop, and whitespace.
- The AI must not enlarge, stretch, crop, or reposition unrelated atoms.

### 9.6 Asset Protection

The AI must not recolor, redraw, decorate, crop, or invent extra details on:

- Uploaded logos
- Uploaded replacement images
- Product photos
- App screenshots
- QR codes
- App store badges
- Social icons
- Contact icons

Exception: The AI may modify these assets only when the user explicitly asks for that exact change in Essentials.

### 9.7 Parent-Child Workflow

- First generation uses the uploaded reference as Source.
- After generation, the child output becomes the new active Source.
- Future generations continue editing from the latest generated parent.
- The original upload remains available for reset/history but does not control later rounds unless the user resets.

### 9.8 Output Size

- Users can match the uploaded reference size.
- Users can select common social formats.
- Generated output should preserve the selected aspect ratio.
- Content must stay inside safe areas.

### 9.9 Error Handling

- The app must show friendly errors for:
  - API quota problems
  - Server timeouts
  - Oversized upload packages
  - Invalid AI JSON
  - Missing environment variables
  - Failed image generation
- The app should compress generation uploads before sending them.

## 10. AI Requirements

### Analysis Models

Spyda should support:

- OpenAI analysis model, currently configured as GPT-4o.
- Groq vision model for analysis acceleration.
- Google Vision OCR for more reliable text extraction.

### Generation Model

Spyda uses GPT-Image 2 for design generation.

### Prompt Requirements

Generation prompts must include:

- Active parent source role.
- Current child source role.
- Selected atom changes only.
- Full layout lock map.
- Brand constants.
- Asset protection rules.
- Output size requirements.
- Replacement sizing rules.

### QA Requirements

Spyda should eventually include an automatic layout QA gate that checks:

- Top logo is not cropped.
- Footer is not cut off.
- QR code stays visible.
- Main subject does not grow beyond the parent region.
- Headline region does not expand.
- Protected assets are not recolored.
- Output aspect ratio matches the source/selected size.

If QA fails, Spyda should either regenerate automatically or warn the user before spending another credit.

## 11. UX Requirements

### Workspace

- The workspace should feel like a premium design tool.
- The source and child-source relationship should be visually obvious.
- The page should scroll without making fixed sidebars awkward.
- Canvas interactions should feel smooth.
- Users should clearly see how many changes are selected out of 3.

### Navigation

- Landing page
- Workspace
- Pricing
- Sign in
- Sign up
- Account settings

### PWA

- Spyda should be installable as a PWA.
- The splash experience should feel premium.
- The PWA should avoid showing browser-like chrome where possible.

## 12. Pricing and Credits

Spyda should use a credit-based model because each generation consumes AI resources.

Pricing requirements:

- Users can view pricing from the landing page.
- Users can sign up before buying.
- Credits are spent when generating a flyer.
- Failed generations due to platform errors should not burn user credits in the final production model.
- Account settings should show credits, plan, and profile details.

## 13. Technical Requirements

### Frontend

- Vite/React app located in `spyda-client/`.
- Responsive UI.
- PWA support.
- Supabase authentication.
- Paystack payment integration.

### Backend

- Vercel serverless API routes.
- Multipart upload handling.
- Generation upload compression.
- Environment variable based model configuration.

### Required Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `GOOGLE_VISION_CREDENTIALS` or equivalent base64 JSON credential variable
- `OPENAI_IMAGE_MODEL`
- `OPENAI_ANALYSIS_MODEL`
- `GROQ_ANALYSIS_MODEL`

## 14. Data Requirements

### Design Project

- Project ID
- User ID
- Original upload preview
- Current generated source
- Design breakdown
- Atom edits
- Brand constants
- Essentials
- Output history
- QA results
- Created/updated timestamps

### Atom

- ID
- Name
- Type
- Content
- Bounding box
- Section ID
- Layer index
- Replacement value
- Replacement asset
- Deleted/used state

### Style Tokens

- Palette
- Typography
- Spacing
- Shadows
- Gradients
- Effects
- Border radius
- Lighting

## 15. Success Metrics

### Product Metrics

- Upload-to-analysis success rate.
- Analysis-to-generation conversion rate.
- Generation success rate.
- Average generations per project.
- Download rate.
- Sign-up conversion from landing page.
- Paid conversion rate.

### Quality Metrics

- Percentage of generations with uncropped top/bottom content.
- Percentage of outputs matching selected aspect ratio.
- Percentage of protected assets preserved.
- User-rated reference similarity.
- User-rated design quality.

### Performance Metrics

- Average analysis time.
- Average generation time.
- API timeout rate.
- Payload size failure rate.

## 16. Known Risks

- GPT-Image 2 may still reinterpret layouts instead of strictly editing them.
- Raster uploads do not contain true editable layers.
- AI models can miss small atoms during analysis.
- Brand constants can overpower reference styling if not constrained.
- Reusing a bad generated output as the next parent may compound layout errors.
- Serverless timeouts can occur during heavy generation requests.
- Large replacement images can create upload failures.

## 17. Open Questions

- Should users be allowed to choose between "strict reference mode" and "creative redesign mode"?
- Should Spyda implement an automatic retry when layout QA fails?
- Should the original upload remain visible beside the active generated parent for comparison?
- Should used atoms be archived instead of fully hidden?
- Should credits be charged only after QA passes?
- Should the product support team/shared workspaces?

## 18. MVP Acceptance Criteria

The MVP is acceptable when:

- A user can upload a flyer and receive a structured atom breakdown.
- The user can edit exactly 3 changes per round.
- Brand constants are always applied globally.
- Protected logos/images are not intentionally recolored unless requested.
- GPT-Image 2 generates a child flyer.
- The generated child becomes the next active source.
- The output keeps the original aspect ratio.
- The user can download the result.
- The app handles common errors without blank screens.

## 19. Future Roadmap

### Phase 1

- Improve analysis reliability.
- Improve generation layout locking.
- Add clear QA warnings.

### Phase 2

- Add automatic layout QA and regeneration.
- Add project history.
- Add better credit handling.
- Add cloud storage for assets.

### Phase 3

- Add team workspaces.
- Add template libraries.
- Add multiple creative directions from one source.
- Add strict/creative generation modes.

### Phase 4

- Expand beyond flyers into other design formats.
- Add deeper editable canvas tooling.
- Explore vector/HTML reconstruction for more precise editing.

