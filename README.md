# Spyda - Flyer Imitator (Product Requirements Document)

## 1. Product Overview
**Spyda** is an AI-powered generative design application that allows users to upload a reference flyer (or graphic design) and seamlessly reconstruct it with new "ingredients." Instead of prompting an image generator from scratch, users provide a successful design which Spyda deconstructs into atomic components (layout, text, styling, colors). Users can then swap out these components and generate new, on-brand iterations of the design.

## 2. Target Audience
- Graphic Designers looking to quickly iterate on successful layouts.
- Marketing Teams needing to scale ad creatives while maintaining brand consistency.
- Social Media Managers generating variants of event flyers, promotional posts, or announcements.

## 3. Core Architecture & Tech Stack
The application is a client-side web app utilizing:
- **HTML5/CSS3:** Grid/Flexbox layouts, fluid responsiveness, custom UI styling (dark mode, premium glassmorphic aesthetic).
- **Vanilla JavaScript (`assets/spyda-workspace.js`):** State management, interactive canvas controls (panning, zooming, drag-and-drop), SVG rendering for connection lines, and event listeners.
- **AI Integrations (Mocked/Future):** 
  - Vision models (e.g., Groq Vision) for parsing and analyzing the uploaded reference.
  - Image Generation models (e.g., GPT-Image 2) for rendering the final output.

## 4. Key Features & Workflows

### 4.1. The Interactive Canvas ("Spider Web")
- **Upload & Parse:** Users drop a reference image onto the canvas. The app visually "breaks it into a web."
- **Atom Cards:** The system extracts the graphic into distinct nodes connected by SVG lines (the "web") to the central source graphic:
  - **Text Nodes:** Headlines, body copy, calls to action.
  - **Style Nodes:** Brand fonts (Heading, Body), color palettes (60-30-10 rule).
  - **Image Nodes:** Subject cutouts, background elements.
- **Canvas Controls:** Infinite-like panning (bounded to avoid getting lost), zooming controls, and draggable atom cards for workspace organization.

### 4.2. Ingredients Editor
Located in the "Ingredients" panel, this acts as the control center for modifying the extracted design:
- **Design Sections (Ingredient Map):** A breakdown of the recognized layout (Hero, Main Subject, Offers, Footer, etc.).
- **Replacements Sheet:** Input fields where users enter new content (e.g., new headline text, new discount offer, uploading a new subject image).
- **Constants Board:** Global brand requirements that must remain unchanged (e.g., "Space Grotesk font", "Premium Photoshop feel").
- **Essentials Board (Chat Box):** A manual override interface where users can type in any missed or custom requirements and "Load" them into the AI's generation prompt.

### 4.3. Generation Control Room
- **Output Settings:** Dropdown selections for AI Model (e.g., GPT-Image 2), aspect ratio/format (e.g., 1:1 Feed Post), and rendering quality (Standard vs. Ultra).
- **Prompt Recipe Compilation:** The app compiles the reference structure, replacement content, style constants, and subject images into a master prompt.
- **Results Wall:** Displays the AI-generated variants. Users can review, compare, and accept the final design.

## 5. UI/UX Guidelines
- **Aesthetic:** Dark, sleek, "control room" vibe. Uses CSS variables for consistent theming.
- **Fluid Layout:** Uses CSS Grid (`.app-shell`, `.ingredient-page-grid`) to adapt between desktop and mobile viewing.
- **Spatial UX:** The canvas must provide "breathing room" to drag cards without infinite expansion. The layout naturally extends to accommodate content while avoiding visual clutter.

## 6. Project Files
- `workspace.html`: The main structural DOM layout containing the App Shell, navigation rail, Canvas panel, Ingredients panel, and Generate panel.
- `styles.css`: The central stylesheet containing CSS variables, layout rules, custom scrollbars, and interactive states.
- `assets/spyda-workspace.js`: Contains logic for drag-and-drop, UI state transitions, SVG line updating (`updateWebLines`), viewport math (`syncCanvasStageSize`), and simulated AI processing flows.

## 7. Future AI Implementation Notes for Agents
If you are an AI tasked with modifying this codebase:
- Respect the Vanilla JS architecture. Do not introduce frameworks (React, Vue) unless explicitly requested.
- Maintain the exact CSS grid structures. When adding new panels (like the Essentials board), ensure they conform to the existing responsive rules (e.g., `.bottom-boards` flex layout).
- Panning math and SVG line updates are tightly coupled. Be careful when modifying `getCanvasPoint`, `setCanvasStageSize`, or `updateWebLines`.
