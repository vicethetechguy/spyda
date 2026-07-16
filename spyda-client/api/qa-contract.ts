type QaAtom = {
  id?: string;
  name?: string;
  type?: string;
  content?: string;
  style?: string;
  boundingBox?: unknown;
  deleted?: boolean;
};

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isProtectedAsset(atom: QaAtom) {
  const signature = `${atom.type || ""} ${atom.name || ""} ${atom.content || ""}`.toLowerCase();
  return /(logo|image|photo|subject|product|device|screenshot|qr|badge|icon|app store|google play)/.test(signature);
}

export type ApprovedDifferenceContract = {
  textChanges: Array<{ objectId: string; atom: string; from: string; to: string }>;
  assetChanges: Array<{ objectId: string; atom: string; replaces: string; replacement: string; boundingBox: unknown }>;
  otherChanges: Array<{ objectId: string; atom: string; instruction: string }>;
  essentials: string[];
  brandChanges: Record<string, string>;
  globalBrandRestyleApproved: boolean;
  unchangedText: Array<{ objectId: string; atom: string; requiredText: string; boundingBox: unknown }>;
  protectedAssets: Array<{ objectId: string; atom: string; identity: string; boundingBox: unknown }>;
};

export function buildApprovedDifferenceContract(recipe: any): ApprovedDifferenceContract {
  const textChanges = list(recipe?.textEdits).map(edit => ({
    objectId: text(edit?.objectId),
    atom: text(edit?.atomName) || "Text",
    from: text(edit?.from),
    to: text(edit?.to),
  })).filter(edit => edit.objectId || edit.to);

  const pastedAssets = list(recipe?.pastedAssets).map(asset => ({
    objectId: text(asset?.objectId),
    atom: text(asset?.atomName) || "Asset",
    replaces: text(asset?.originalContent) || text(asset?.atomName) || "Previous asset",
    replacement: text(asset?.name) || "Uploaded replacement",
    boundingBox: asset?.box ?? null,
  }));
  const uploadedAssets = list(recipe?.referenceImages).map(asset => ({
    objectId: text(asset?.sectionId),
    atom: text(asset?.sectionName) || "Asset",
    replaces: text(asset?.originalContent) || text(asset?.sectionName) || "Previous asset",
    replacement: text(asset?.name) || "Uploaded replacement",
    boundingBox: asset?.originalBoundingBox ?? null,
  }));
  const assetChanges = [...pastedAssets, ...uploadedAssets].filter(edit => edit.objectId || edit.replacement);

  const otherChanges = list(recipe?.otherEdits).map(edit => ({
    objectId: text(edit?.objectId),
    atom: text(edit?.atomName) || "Element",
    instruction: text(edit?.instruction),
  })).filter(edit => edit.objectId || edit.instruction);

  const essentials = list(recipe?.essentials).map(text).filter(Boolean);
  const brandChanges = Object.fromEntries(
    Object.entries(recipe?.brandOverrides || {})
      .map(([key, value]) => [key, text(value)])
      .filter(([, value]) => Boolean(value)),
  );
  const changedIds = new Set([
    ...textChanges.map(edit => edit.objectId),
    ...assetChanges.map(edit => edit.objectId),
    ...otherChanges.map(edit => edit.objectId),
  ].filter(Boolean));

  const atoms: QaAtom[] = list(recipe?.editableComponents).filter(atom => atom && !atom.deleted);
  const unchangedText = atoms
    .filter(atom => !changedIds.has(text(atom.id)) && /^(text|action)$/i.test(text(atom.type)) && text(atom.content))
    .map(atom => ({
      objectId: text(atom.id),
      atom: text(atom.name) || "Text",
      requiredText: text(atom.content),
      boundingBox: atom.boundingBox ?? null,
    }));
  const protectedAssets = atoms
    .filter(atom => !changedIds.has(text(atom.id)) && isProtectedAsset(atom))
    .map(atom => ({
      objectId: text(atom.id),
      atom: text(atom.name) || "Protected asset",
      identity: text(atom.content) || text(atom.style) || "Preserve exactly as shown in the parent",
      boundingBox: atom.boundingBox ?? null,
    }));

  return {
    textChanges,
    assetChanges,
    otherChanges,
    essentials,
    brandChanges,
    globalBrandRestyleApproved: Object.keys(brandChanges).length > 0,
    unchangedText,
    protectedAssets,
  };
}

function normalizeCopy(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function findMissingRequiredText(contract: ApprovedDifferenceContract, detectedText: string) {
  const detected = normalizeCopy(detectedText);
  const required = [
    ...contract.textChanges.map(change => ({ atom: change.atom, value: change.to })),
    ...contract.unchangedText
      .filter(change => /(headline|subheadline|tagline|title|offer|cta|call to action|button)/i.test(change.atom))
      .map(change => ({ atom: change.atom, value: change.requiredText })),
  ].filter(item => normalizeCopy(item.value).length >= 3);

  return required.filter(item => {
    const expected = normalizeCopy(item.value);
    if (detected.includes(expected)) return false;
    const tokens = expected.split(" ").filter(token => token.length >= 2);
    if (!tokens.length) return false;
    const matched = tokens.filter(token => detected.split(" ").includes(token)).length;
    return matched / tokens.length < 0.8;
  });
}

export function buildGenerationQaPrompt(recipe: any) {
  const contract = buildApprovedDifferenceContract(recipe);
  const layoutGrid = recipe?.layoutGridGuide;
  const compositeNote = recipe?.compositeMode
    ? "Image 1 already contains deterministically pasted replacement assets at their approved final position and size. Preserve those exact footprints."
    : "Image 1 is the active parent source for this edit round.";
  const brandRule = contract.globalBrandRestyleApproved
    ? `A global brand restyle IS APPROVED. Do not penalize intentional color, gradient, or font changes that use these exact Brand Constants: ${JSON.stringify(contract.brandChanges)}. Still fail any geometry drift, protected-asset recoloring, clipping, invented content, or use of colors outside the approved direction.`
    : "No global brand restyle was approved. Unchanged colors, gradients, and typography must remain faithful to the parent.";

  return `You are Spyda's strict, instruction-aware generation QA gate.

Compare image 1 (the active parent) with image 2 (the generated child). Judge the child against BOTH the parent and the APPROVED DIFFERENCE CONTRACT below. An intentional approved change is not an error. Any difference outside this contract is an error.

${compositeNote}
${brandRule}

APPROVED DIFFERENCE CONTRACT:
${JSON.stringify(contract, null, 2)}

LAYOUT GRID CONTRACT:
${layoutGrid?.columns && layoutGrid?.rows
    ? `${layoutGrid.columns} columns x ${layoutGrid.rows} rows; measured safe area ${JSON.stringify(layoutGrid.safeArea || {})}. Every unchanged atom must remain in the same cells and exact normalized bounds. Every replacement must remain inside the footprint it replaces. Nothing important may extend beyond the canvas. The grid itself must not appear in the generated design.\n${JSON.stringify((Array.isArray(layoutGrid.atoms) ? layoutGrid.atoms : []).slice(0, 45), null, 2)}`
    : "No explicit layout grid was supplied; use the parent image geometry as the grid truth."}

HARD GATES — fail the result when any one occurs:
1. GEOMETRY: an unchanged region, subject, headline block, CTA, footer, logo, or decorative structure moved, resized, stretched, compressed, reflowed, or changed visual footprint.
2. CONTENT: required unchanged text disappeared, changed wording, or new unrequested wording appeared. Detect irrelevant or hallucinated copy even when it fits visually.
3. APPROVED EDITS: any requested replacement text, asset, Essential, or Brand Constant was not applied accurately.
4. PROTECTED ASSETS: an unchanged logo, photo, product, screenshot, QR code, badge, icon, or uploaded asset was recolored, redrawn, cropped, decorated, replaced, or had invented marks added.
5. EDGE SAFETY: anything important is clipped, cropped by the canvas, pushed into an unsafe edge, or made unreadable. Logos and footer details must be fully visible.
6. REPLACEMENT FOOTPRINT: every changed text/image/logo stays inside the original atom region at the same apparent width, height, position, crop relationship, and visual weight.
7. CANVAS: aspect ratio and full-bleed composition match the parent; no letterboxing or internal artwork compression.
8. BRAND: when a brand restyle is approved, apply it to style surfaces only. Never recolor identity assets. When no brand restyle is approved, preserve the parent palette.
9. TRUE ASSET SWAP: for every approved asset change, the previous asset identity must be completely absent and exactly one requested replacement must be visible. Fail if the old and new assets coexist, overlap, ghost through, or if the replacement is duplicated, redrawn, or decorated with invented marks.

SCORING:
- Score layout, content, assets, brand compliance, and edge safety independently from 0-100.
- Overall 100 is allowed only when every category is 100, every approved change is present, and there are no hard-gate failures or unapproved changes.
- A visually attractive result still fails if it invents copy, mutates a protected logo, clips content, or changes geometry.

Return ONLY valid JSON:
{
  "passed": false,
  "score": 0,
  "categoryScores": { "layout": 0, "content": 0, "assets": 0, "brand": 0, "edgeSafety": 0 },
  "layoutMatch": "specific note",
  "textMatch": "specific note",
  "assetMatch": "specific note",
  "sizeMatch": "specific note",
  "approvedChangesApplied": ["confirmed approved changes"],
  "unapprovedChanges": ["differences not authorized by the contract"],
  "hardGateFailures": [{ "code": "short-code", "message": "specific failure", "region": "atom or area" }],
  "issues": ["most important defects, worst first"],
  "suggestions": ["precise correction that preserves approved changes"]
}`;
}
