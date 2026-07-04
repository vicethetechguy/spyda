const flyerInput = document.querySelector("#flyerInput");
const dropZone = document.querySelector("#dropZone");
const analyzeButton = document.querySelector("#analyzeButton");
const resetButton = document.querySelector("#resetButton");
const generateButton = document.querySelector("#generateButton");
const canvasModelButton = document.querySelector("#canvasModelButton");
const generationModelButton = document.querySelector("#generationModelButton");
const generationFormatButton = document.querySelector("#generationFormatButton");
const generationSizeButton = document.querySelector("#generationSizeButton");
const generationQualityButton = document.querySelector("#generationQualityButton");
const canvasHeadingFontInput = document.querySelector("#canvasHeadingFontInput");
const canvasBodyFontInput = document.querySelector("#canvasBodyFontInput");
const canvasZoomOutButton = document.querySelector("#canvasZoomOutButton");
const canvasZoomInButton = document.querySelector("#canvasZoomInButton");
const canvasZoomLabel = document.querySelector("#canvasZoomLabel");
const workspaceTitle = document.querySelector("#workspaceTitle");
const workspaceSubtitle = document.querySelector("#workspaceSubtitle");
const workspaceStatus = document.querySelector("#workspaceStatus");
const railViewButtons = Array.from(document.querySelectorAll("[data-view]"));
const appViews = Array.from(document.querySelectorAll("[data-view-panel]"));
const flyerPreview = document.querySelector("#flyerPreview");
const flyerCore = document.querySelector("#flyerCore");
const canvasPanel = document.querySelector(".canvas-panel");
const canvasWorld = document.querySelector("#canvasWorld");
const canvasStage = document.querySelector("#canvasStage");
const subjectInput = document.querySelector("#subjectInput");
const subjectUploadButton = document.querySelector("#subjectUploadButton");
const subjectUploadFeedback = document.querySelector("#subjectUploadFeedback");
const imageLayerCard = document.querySelector(".node-image");
const atomWeb = document.querySelector("#atomWeb");
const spydaDropdowns = Array.from(document.querySelectorAll("[data-dropdown]"));
const sidebarAvatarMini = document.querySelector("#sidebarAvatarMini");
const profileAvatar = document.querySelector("#profileAvatar");
const profileAvatarInitial = document.querySelector("#profileAvatarInitial");
const profileAvatarImage = document.querySelector("#profileAvatarImage");
const profileImageInput = document.querySelector("#profileImageInput");
const profileImageButton = document.querySelector("#profileImageButton");
const removeProfileImageButton = document.querySelector("#removeProfileImageButton");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const settingsStatus = document.querySelector("#settingsStatus");
const accountSettingFields = {
  name: document.querySelector("#profileNameInput"),
  email: document.querySelector("#profileEmailInput"),
  company: document.querySelector("#profileCompanyInput"),
  role: document.querySelector("#profileRoleInput"),
  headingFont: document.querySelector("#defaultHeadingFontInput"),
  bodyFont: document.querySelector("#defaultBodyFontInput"),
  primaryColor: document.querySelector("#defaultPrimaryColorInput"),
  secondaryColor: document.querySelector("#defaultSecondaryColorInput"),
  accentColor: document.querySelector("#defaultAccentColorInput"),
  visualStyle: document.querySelector("#defaultVisualStyleInput"),
  model: document.querySelector("#defaultModelInput"),
  format: document.querySelector("#defaultFormatInput"),
  quality: document.querySelector("#defaultQualityInput"),
  autoSend: document.querySelector("#autoSendToggle"),
};
const uploadState = document.querySelector("#uploadState");
const detectedCount = document.querySelector("#detectedCount");
const textCount = document.querySelector("#textCount");
const imageCount = document.querySelector("#imageCount");
const styleCount = document.querySelector("#styleCount");
const designSectionCount = document.querySelector("#designSectionCount");
const breakdownList = document.querySelector("#breakdownList");
const ingredientStatus = document.querySelector("#ingredientStatus");
const ingredientList = document.querySelector("#ingredientList");
const steps = Array.from(document.querySelectorAll(".steps li"));
const draggableCanvasItems = Array.from(document.querySelectorAll(".flyer-core"));
const canvasToolbar = document.querySelector(".canvas-toolbar");
const webLines = document.querySelector(".web-lines");

const detectedNodes = [
  { type: "text", name: "Hero Section" },
  { type: "image", name: "Primary Image" },
  { type: "text", name: "Offer Block" },
  { type: "text", name: "CTA Section" },
  { type: "style", name: "Visual Style" },
];

let uploadedImageUrl = "";
let uploadedSubjectUrl = "";
let uploadedDesignFile = null;
let uploadedSubjectFile = null;
let latestBreakdown = null;
let activeDrag = null;
let activeCanvasPan = null;
let profileImageDataUrl = "";
let webLineAnimationFrame = 0;
let canvasZoom = 1;
let canvasStageSize = { width: 0, height: 0 };
let activeViewName = "canvas";
let colorSystemState = {
  primary: "#0F172A",
  secondary: "#22C55E",
  accent: "#F8FAFC",
};
const accountStorageKey = "spyda-account-settings";
const canvasEdgeBuffer = 180;
const canvasExpansionChunk = 720;
const minCanvasZoom = 0.5;
const maxCanvasZoom = 2.4;
const canvasWheelZoomStep = 0.1;

const viewHeaderMeta = {
  canvas: {
    title: "Spyda",
    subtitle: "Design breakdown workspace",
    status: "Breakdown ready",
  },
  ingredients: {
    title: "Ingredients",
    subtitle: "Replacement checklist and detected design sections",
    status: "Checklist view",
  },
  generate: {
    title: "Generate",
    subtitle: "Output settings, recipe review, and flyer variations",
    status: "Generation room",
  },
  settings: {
    title: "Account",
    subtitle: "Profile, brand defaults, and generation preferences",
    status: "Settings",
  },
};

const defaultIngredientListMarkup = ingredientList?.innerHTML || "";
const defaultBreakdownListMarkup = breakdownList.innerHTML;

function setCanvasZoom(nextZoom) {
  const centerX = canvasWorld.scrollLeft + canvasWorld.clientWidth / 2;
  const centerY = canvasWorld.scrollTop + canvasWorld.clientHeight / 2;
  const ratioX = centerX / Math.max(canvasStage.offsetWidth, 1);
  const ratioY = centerY / Math.max(canvasStage.offsetHeight, 1);

  canvasZoom = Math.min(Math.max(nextZoom, minCanvasZoom), maxCanvasZoom);
  syncCanvasStageSize();

  window.requestAnimationFrame(() => {
    canvasWorld.scrollLeft = canvasStage.offsetWidth * ratioX - canvasWorld.clientWidth / 2;
    canvasWorld.scrollTop = canvasStage.offsetHeight * ratioY - canvasWorld.clientHeight / 2;
    updateWebLines();
  });

  canvasZoomLabel.textContent = `${Math.round(canvasZoom * 100)}%`;
}

function syncCanvasStageSize() {
  const worldWidth = canvasWorld.clientWidth || 900;
  const worldHeight = canvasWorld.clientHeight || 620;
  // Add a fixed padding of 1200px (600px per side) for breathing room
  const baseWidth = worldWidth + 1200;
  const baseHeight = worldHeight + 1200;
  const width = Math.round(baseWidth * canvasZoom);
  const height = Math.round(baseHeight * canvasZoom);

  setCanvasStageSize(width, height);
}

function setCanvasStageSize(width, height) {
  canvasStageSize = {
    width: Math.max(Math.round(width), canvasWorld.clientWidth || 1),
    height: Math.max(Math.round(height), canvasWorld.clientHeight || 1),
  };

  canvasStage.style.setProperty("--canvas-stage-width", `${canvasStageSize.width}px`);
  canvasStage.style.setProperty("--canvas-stage-height", `${canvasStageSize.height}px`);
  canvasStage.style.setProperty("--canvas-element-zoom", canvasZoom.toFixed(2));
}

function centerCanvasView() {
  syncCanvasStageSize();

  window.requestAnimationFrame(() => {
    canvasWorld.scrollLeft = Math.max((canvasStage.offsetWidth - canvasWorld.clientWidth) / 2, 0);
    canvasWorld.scrollTop = Math.max((canvasStage.offsetHeight - canvasWorld.clientHeight) / 2, 0);
    updateWebLines();
  });
}

function getMovableCanvasItems() {
  return [flyerCore, ...Array.from(document.querySelectorAll(".atom-card"))].filter(Boolean);
}

function materializeCanvasPosition(item) {
  const itemRect = item.getBoundingClientRect();
  const canvasRect = canvasStage.getBoundingClientRect();

  item.style.left = `${itemRect.left - canvasRect.left}px`;
  item.style.top = `${itemRect.top - canvasRect.top}px`;
  item.style.right = "auto";
  item.style.bottom = "auto";
  item.style.transform = "none";
}

function shiftCanvasItems(deltaX, deltaY) {
  if (deltaX === 0 && deltaY === 0) return;

  getMovableCanvasItems().forEach((item) => {
    materializeCanvasPosition(item);
    item.style.left = `${parseFloat(item.style.left || "0") + deltaX}px`;
    item.style.top = `${parseFloat(item.style.top || "0") + deltaY}px`;
  });
}

function expandCanvasStage({ left = 0, right = 0, top = 0, bottom = 0 }) {
  if (!left && !right && !top && !bottom) return;

  const nextWidth = canvasStage.offsetWidth + left + right;
  const nextHeight = canvasStage.offsetHeight + top + bottom;

  setCanvasStageSize(nextWidth, nextHeight);

  if (left || top) {
    shiftCanvasItems(left, top);
    canvasWorld.scrollLeft += left;
    canvasWorld.scrollTop += top;
  }

  window.requestAnimationFrame(updateWebLines);
}

function ensureInfiniteCanvasRoom() {
  // Disabled as per user request to prevent unlimited scrolling
}

function getSelectedModelName() {
  return generationModelButton?.textContent.trim() || canvasModelButton?.textContent.trim() || "GPT-Image 2";
}

function getSelectedAiProvider() {
  return getSelectedModelName().toLowerCase().includes("groq") ? "groq" : "openai";
}

function syncModelButtons(modelName) {
  [canvasModelButton, generationModelButton].forEach((button) => {
    if (button) button.textContent = modelName;
  });

  document.querySelectorAll('[aria-label="AI model options"] [role="option"], [aria-label="Generation model options"] [role="option"]').forEach((button) => {
    button.setAttribute("aria-selected", String(button.textContent.trim() === modelName));
  });
}

function switchView(viewName) {
  const header = viewHeaderMeta[viewName] || viewHeaderMeta.canvas;
  activeViewName = viewName;

  railViewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  appViews.forEach((view) => {
    view.classList.toggle("active-view", view.dataset.viewPanel === viewName);
  });

  if (workspaceTitle) workspaceTitle.textContent = header.title;
  if (workspaceSubtitle) workspaceSubtitle.textContent = header.subtitle;
  if (workspaceStatus) workspaceStatus.textContent = header.status;
  if (resetButton) resetButton.textContent = viewName === "settings" ? "Log out" : "Reset";

  if (viewName === "canvas") {
    syncCanvasStageSize();
    window.requestAnimationFrame(updateWebLines);
  }
}

function handleTopbarAction() {
  if (activeViewName === "settings") {
    window.location.href = "signin.html";
    return;
  }

  resetApp();
}

function setStepState(activeIndex) {
  steps.forEach((step, index) => {
    step.classList.toggle("done", index < activeIndex);
    step.classList.toggle("active", index === activeIndex);
  });
}

function setAwaitingUpload(isAwaiting) {
  uploadState.textContent = isAwaiting ? "Awaiting upload" : "";
  uploadState.classList.toggle("awaiting", isAwaiting);
  uploadState.classList.toggle("cleared", !isAwaiting);
}

function startLiveWebLines() {
  window.cancelAnimationFrame(webLineAnimationFrame);

  const tick = () => {
    updateWebLines();
    if (canvasPanel.classList.contains("analyzing")) {
      webLineAnimationFrame = window.requestAnimationFrame(tick);
    }
  };

  webLineAnimationFrame = window.requestAnimationFrame(tick);
}

function stopLiveWebLines() {
  window.cancelAnimationFrame(webLineAnimationFrame);
  webLineAnimationFrame = 0;
  window.requestAnimationFrame(updateWebLines);
}

function toTitleCase(text = "") {
  return text
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function getSectionTypeLabel(type = "") {
  const normalized = type.toLowerCase();
  if (normalized === "action") return "Action";
  if (normalized === "brand") return "Brand";
  if (normalized === "decor") return "Decor";
  return toTitleCase(normalized || "Section");
}

function getSectionSummary(section) {
  const current = section.current || {};
  const visibleText = current.text ? `Text: "${current.text}"` : "";
  const imageNote = current.image ? `Image: ${current.image}` : "";
  const description = current.description || "";
  const replacements = Array.isArray(section.replacementNeeded) ? section.replacementNeeded.join(", ") : "";

  return [visibleText, imageNote, description, replacements && `Replace with: ${replacements}`].filter(Boolean).join(" | ");
}

function getCanonicalNodeId(section) {
  const searchable = `${section.id || ""} ${section.name || ""} ${section.type || ""}`.toLowerCase();

  if (searchable.includes("hero") || searchable.includes("headline")) return "hero";
  if (searchable.includes("image") || searchable.includes("subject") || searchable.includes("product") || searchable.includes("photo")) return "image";
  if (searchable.includes("offer") || searchable.includes("price") || searchable.includes("promo") || searchable.includes("discount")) return "offer";
  if (searchable.includes("cta") || searchable.includes("action") || searchable.includes("contact") || searchable.includes("order")) return "cta";
  if (searchable.includes("color") || searchable.includes("palette")) return "color";
  if (searchable.includes("style") || searchable.includes("background") || searchable.includes("decor") || searchable.includes("lighting")) return "style";

  return "";
}

function isBrandConstantSection(section = {}) {
  const searchable = `${section.id || ""} ${section.name || ""} ${section.type || ""}`.toLowerCase();
  return section.type === "color" || searchable.includes("color system") || searchable.includes("palette") || searchable.includes("typography") || searchable.includes("font");
}

function getAtomId(index) {
  return `atom-${index + 1}`;
}

function getAtomPosition(index, total) {
  const positions = [
    { x: 27, y: 26 },
    { x: 73, y: 26 },
    { x: 27, y: 42 },
    { x: 73, y: 42 },
    { x: 28, y: 59 },
    { x: 72, y: 59 },
    { x: 38, y: 68 },
    { x: 62, y: 68 },
    { x: 41, y: 23 },
    { x: 59, y: 23 },
    { x: 24, y: 67 },
    { x: 76, y: 67 },
  ];

  if (index < positions.length) return positions[index];

  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * 26,
    y: 50 + Math.sin(angle) * 26,
  };
}

function getDesignZone(section, index, total) {
  const searchable = `${section.id || ""} ${section.name || ""} ${section.type || ""} ${section.current?.description || ""}`.toLowerCase();

  if (section.isBrandCard) return "brand";
  if (/(header|top|hero|headline|logo|navigation|intro)/.test(searchable)) return "top";
  if (/(footer|bottom|contact|address|social|legal|cta|call to action)/.test(searchable)) return "bottom";
  if (/(middle|body|main|product|subject|image|photo|offer|price|promo|decor|background)/.test(searchable)) return "middle";

  const third = Math.ceil(total / 3);
  if (index < third) return "top";
  if (index < third * 2) return "middle";
  return "bottom";
}

function getDesignZoneLabel(zone) {
  if (zone === "top") return "Top";
  if (zone === "middle") return "Middle";
  if (zone === "bottom") return "Bottom";
  return "Brand";
}

function createAtomInput(section, index) {
  const type = (section.type || "").toLowerCase();
  const searchable = `${section.id || ""} ${section.name || ""}`.toLowerCase();
  const replacement = Array.isArray(section.replacementNeeded) && section.replacementNeeded.length
    ? section.replacementNeeded[0]
    : `Replacement for ${section.name || `atom ${index + 1}`}`;

  if (type === "image" || searchable.includes("image") || searchable.includes("photo") || searchable.includes("subject") || searchable.includes("product")) {
    const wrapper = document.createElement("div");
    wrapper.className = "atom-action-group";

    const button = document.createElement("button");
    button.className = "node-button";
    button.type = "button";
    button.textContent = uploadedSubjectFile ? "Replace subject" : "Upload replacement";
    button.dataset.subjectUpload = "true";

    const feedback = document.createElement("span");
    feedback.className = "upload-feedback";
    feedback.textContent = uploadedSubjectFile?.name || "No subject selected";

    wrapper.append(button, feedback);
    return wrapper;
  }

  if (type === "text" || type === "action" || type === "brand" || searchable.includes("text") || searchable.includes("headline") || searchable.includes("copy") || searchable.includes("cta") || searchable.includes("contact")) {
    const field = document.createElement("textarea");
    field.className = "atom-field atom-text-box";
    field.value = section.current?.text || "";
    field.placeholder = replacement;
    field.dataset.atomInput = String(index);
    return field;
  }

  const field = type === "style" || type === "decor" ? document.createElement("textarea") : document.createElement("input");
  field.className = "atom-field";
  field.value = section.current?.text || "";
  field.placeholder = replacement;
  field.dataset.atomInput = String(index);
  return field;
}

function createBrandCardInput() {
  const wrapper = document.createElement("div");
  wrapper.className = "brand-card-controls";
  wrapper.innerHTML = `
    <div class="brand-font-grid">
      <label>
        <span>Heading font</span>
        <input class="atom-field" data-font-role="heading" list="fontTemplateList" value="${canvasHeadingFontInput?.value || "Space Grotesk"}" />
      </label>
      <label>
        <span>Body font</span>
        <input class="atom-field" data-font-role="body" list="fontTemplateList" value="${canvasBodyFontInput?.value || "Montserrat"}" />
      </label>
    </div>
  `;

  wrapper.append(createColorSystemControls());

  const styleLabel = document.createElement("label");
  styleLabel.className = "brand-style-field";
  styleLabel.innerHTML = `
    <span>Visual style</span>
    <textarea class="atom-field" data-brand-style placeholder="Premium Photoshop style, lighting, texture, background feel">${latestBreakdown?.constants?.visualStyle || "Same as uploaded flyer"}</textarea>
  `;
  wrapper.append(styleLabel);

  return wrapper;
}

function createColorSystemControls() {
  const colors = getColorSystemValues();
  const wrapper = document.createElement("div");
  wrapper.className = "color-chip-row";
  wrapper.setAttribute("aria-label", "Editable color system");

  [
    ["primary", "60"],
    ["secondary", "30"],
    ["accent", "10"],
  ].forEach(([role, label]) => {
    const row = document.createElement("label");
    const labelText = document.createElement("span");
    const picker = document.createElement("input");

    row.className = "color-chip-control";
    row.style.setProperty("--chip-color", colors[role]);
    row.title = `${label}% ${colors[role]}`;
    labelText.textContent = label;
    labelText.className = "color-chip-label";
    picker.className = "color-picker";
    picker.type = "color";
    picker.value = colors[role].toLowerCase();
    picker.dataset.colorRole = role;
    picker.title = `${label}% ${colors[role]}`;

    row.append(picker, labelText);
    wrapper.append(row);
  });

  return wrapper;
}

function renderAtomCards(sections) {
  atomWeb.innerHTML = "";

  const baseSections = sections.length
    ? [...sections]
    : [
      { id: "hero", name: "Hero Section", type: "text", current: { description: "Main headline and supporting message." }, replacementNeeded: ["New headline"] },
      { id: "image", name: "Image Layer", type: "image", current: { description: "Main product or subject image." }, replacementNeeded: ["Replacement image"] },
    ];

  const visibleSections = baseSections.filter((section) => {
    return !isBrandConstantSection(section);
  });

  const brandCard = {
    id: "brand-card",
    name: "Brand Card",
    type: "brand",
    current: { description: "Brand color, font, style, and design constants used to generate the new flyer." },
    replacementNeeded: ["Brand colors", "Heading font", "Body font", "Visual style"],
    isBrandCard: true,
  };

  const atomSections = [...visibleSections, brandCard];

  atomSections.forEach((section, index) => {
    const card = document.createElement("article");
    const position = getAtomPosition(index, atomSections.length);
    const atomId = getAtomId(index);
    const zone = getDesignZone(section, index, atomSections.length);

    card.className = `node-card atom-card atom-${section.type || "section"} zone-${zone}${section.isBrandCard ? " brand-atom-card" : ""}`;
    card.dataset.node = atomId;
    card.dataset.atomIndex = String(index);
    card.style.left = `${position.x}%`;
    card.style.top = `${position.y}%`;
    card.style.setProperty("--reveal-delay", `${Math.min(index * 110, 1500)}ms`);

    const type = document.createElement("span");
    type.className = "node-type";
    type.textContent = getSectionTypeLabel(section.type);

    const zoneBadge = document.createElement("span");
    zoneBadge.className = "zone-badge";
    zoneBadge.textContent = getDesignZoneLabel(zone);

    const title = document.createElement("strong");
    title.textContent = section.name || toTitleCase(section.id || atomId);

    const copy = document.createElement("p");
    copy.textContent = getSectionSummary(section) || "Editable atom detected from the uploaded design.";

    card.append(type, zoneBadge, title, copy, section.isBrandCard ? createBrandCardInput() : createAtomInput(section, index));
    atomWeb.append(card);
    enableCanvasDrag(card);
  });

  renderWebLines();
  revealAtomCards();
  window.requestAnimationFrame(updateWebLines);
}

function renderWebLines() {
  webLines.innerHTML = "";

  document.querySelectorAll(".atom-card").forEach((card, index) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("line", "atom-line", `line-${index + 1}`);
    path.dataset.lineFor = card.dataset.node;
    path.style.setProperty("--reveal-delay", `${Math.min(index * 110, 1500)}ms`);
    webLines.append(path);
  });
}

function revealAtomCards() {
  const cards = Array.from(document.querySelectorAll(".atom-card"));
  const lines = Array.from(webLines.querySelectorAll(".atom-line"));

  cards.forEach((card, index) => {
    window.setTimeout(() => {
      card.classList.add("revealed");
      lines[index]?.classList.add("revealed");
      const label = card.querySelector("strong")?.textContent || `Atom ${index + 1}`;
      ingredientStatus.textContent = `Found ${label}`;
      updateWebLines();
      if (index === cards.length - 1) {
        window.setTimeout(() => {
          ingredientStatus.textContent = "Fill blanks";
        }, 650);
      }
    }, Math.min(index * 110, 1500));
  });
}

function getGeneratedCard() {
  let card = document.querySelector(".node-generated");

  if (card) return card;

  card = document.createElement("article");
  card.className = "node-card atom-card node-generated";
  card.dataset.node = "generated";
  card.style.left = "58%";
  card.style.top = "72%";
  card.innerHTML = `
    <span class="node-type">Generated Flyer</span>
    <strong>New output</strong>
    <p>Generated design appears here after Spyda creates it.</p>
    <div class="generated-preview">
      <img src="assets/spyda-logo-drive.webp" alt="" aria-hidden="true" />
    </div>
  `;

  atomWeb.append(card);
  enableCanvasDrag(card);
  renderWebLines();
  return card;
}

function renderBreakdownList(sections) {
  breakdownList.innerHTML = "";
  designSectionCount.textContent = `${sections.length} component${sections.length === 1 ? "" : "s"}`;

  sections.forEach((section, index) => {
    const row = document.createElement("article");
    row.className = `breakdown-row${index === 0 ? " active" : ""}`;

    const rowIndex = document.createElement("span");
    rowIndex.className = "row-index";
    rowIndex.textContent = String(index + 1).padStart(2, "0");

    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = section.name || toTitleCase(section.id || `Section ${index + 1}`);
    const copy = document.createElement("p");
    copy.textContent = getSectionSummary(section) || "Detected component from the uploaded design.";
    content.append(title, copy);

    const tag = document.createElement("span");
    tag.className = "row-tag";
    tag.textContent = getSectionTypeLabel(section.type);

    row.append(rowIndex, content, tag);
    breakdownList.append(row);
  });
}

function renderReplacementFields(sections) {
  if (!ingredientList) return;

  ingredientList.innerHTML = "";

  sections.slice(0, 10).forEach((section, index) => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const replacement = Array.isArray(section.replacementNeeded) && section.replacementNeeded.length
      ? section.replacementNeeded[0]
      : `Replacement for ${section.name || `section ${index + 1}`}`;
    const field = section.type === "image" ? document.createElement("input") : document.createElement("textarea");

    span.textContent = replacement;
    field.placeholder = section.type === "image"
      ? "Describe or upload the replacement subject"
      : "Type the replacement content here";

    label.append(span, field);
    ingredientList.append(label);
  });
}

function applyBreakdownConstants(constants = {}) {
  const constantsInputs = Array.from(document.querySelectorAll(".constants input"));
  const colors = constants.colors || {};

  if (constants.headingFont && constantsInputs[0]) constantsInputs[0].value = constants.headingFont;
  if (constants.bodyFont && constantsInputs[1]) constantsInputs[1].value = constants.bodyFont;
  if (constants.headingFont && canvasHeadingFontInput) canvasHeadingFontInput.value = constants.headingFont;
  if (constants.bodyFont && canvasBodyFontInput) canvasBodyFontInput.value = constants.bodyFont;
  if (colors.primary && constantsInputs[2]) constantsInputs[2].value = colors.primary;
  if (colors.secondary && constantsInputs[3]) constantsInputs[3].value = colors.secondary;
  if (colors.accent && constantsInputs[4]) constantsInputs[4].value = colors.accent;
  setColorSystemValues({
    primary: colors.primary || constantsInputs[2]?.value,
    secondary: colors.secondary || constantsInputs[3]?.value,
    accent: colors.accent || constantsInputs[4]?.value,
  });

  if (constants.visualStyle && document.querySelector("#styleSelectButton")) {
    document.querySelector("#styleSelectButton").textContent = constants.visualStyle;
  }
}

function normalizeHexColor(value = "") {
  const trimmed = value.trim();
  const expanded = trimmed.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, "#$1$1$2$2$3$3");
  const withHash = expanded.startsWith("#") ? expanded : `#${expanded}`;

  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toUpperCase() : "";
}

function getColorSystemValues() {
  return {
    primary: normalizeHexColor(document.querySelector('[data-hex-role="primary"]')?.value) || normalizeHexColor(document.querySelector('[data-color-role="primary"]')?.value) || colorSystemState.primary,
    secondary: normalizeHexColor(document.querySelector('[data-hex-role="secondary"]')?.value) || normalizeHexColor(document.querySelector('[data-color-role="secondary"]')?.value) || colorSystemState.secondary,
    accent: normalizeHexColor(document.querySelector('[data-hex-role="accent"]')?.value) || normalizeHexColor(document.querySelector('[data-color-role="accent"]')?.value) || colorSystemState.accent,
  };
}

function setColorSystemValues(colors = {}) {
  const constantsInputs = Array.from(document.querySelectorAll(".constants input"));
  const nextColors = {
    primary: normalizeHexColor(colors.primary) || getColorSystemValues().primary,
    secondary: normalizeHexColor(colors.secondary) || getColorSystemValues().secondary,
    accent: normalizeHexColor(colors.accent) || getColorSystemValues().accent,
  };

  colorSystemState = nextColors;

  Object.entries(nextColors).forEach(([role, value]) => {
    const picker = document.querySelector(`[data-color-role="${role}"]`);
    const hexInput = document.querySelector(`[data-hex-role="${role}"]`);
    const chip = picker?.closest(".color-chip-control");

    if (picker) picker.value = value.toLowerCase();
    if (picker) picker.title = `${value}`;
    if (chip) chip.style.setProperty("--chip-color", value);
    if (chip) chip.title = value;
    if (hexInput) hexInput.value = value;
  });

  if (constantsInputs[2]) constantsInputs[2].value = nextColors.primary;
  if (constantsInputs[3]) constantsInputs[3].value = nextColors.secondary;
  if (constantsInputs[4]) constantsInputs[4].value = nextColors.accent;
}

function syncColorControl(role, rawValue, shouldNormalizeField = false) {
  const color = normalizeHexColor(rawValue);
  const picker = document.querySelector(`[data-color-role="${role}"]`);
  const hexInput = document.querySelector(`[data-hex-role="${role}"]`);

  if (!color) return;

  if (picker) picker.value = color.toLowerCase();
  if (picker?.closest(".color-chip-control")) picker.closest(".color-chip-control").style.setProperty("--chip-color", color);
  if (hexInput && shouldNormalizeField) hexInput.value = color;

  setColorSystemValues({
    ...getColorSystemValues(),
    [role]: color,
  });

  if (uploadedImageUrl && canvasPanel.classList.contains("analyzed")) {
    ingredientStatus.textContent = "Editing";
  }
}

function extractColorsFromBreakdown(breakdown = {}) {
  const foundColors = [];
  const scanText = [
    breakdown.notes,
    breakdown.constants?.visualStyle,
    ...(breakdown.sections || []).flatMap((section) => [
      section.name,
      section.current?.text,
      section.current?.image,
      section.current?.description,
      ...(section.replacementNeeded || []),
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  for (const match of scanText.matchAll(/#?[0-9a-f]{6}\b|#?[0-9a-f]{3}\b/gi)) {
    const color = normalizeHexColor(match[0]);
    if (color && !foundColors.includes(color)) foundColors.push(color);
  }

  return {
    primary: normalizeHexColor(breakdown.constants?.colors?.primary) || foundColors[0],
    secondary: normalizeHexColor(breakdown.constants?.colors?.secondary) || foundColors[1],
    accent: normalizeHexColor(breakdown.constants?.colors?.accent) || foundColors[2],
  };
}

async function createFastAnalysisImage(file) {
  const maxEdge = 1280;
  const quality = 0.78;

  if (!file || !file.type.startsWith("image/")) return file;
  if (file.size < 650 * 1024) return file;
  if (!("createImageBitmap" in window)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    if (scale >= 0.98) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-spyda-analysis.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function loadFlyer(file) {
  if (!file || !file.type.startsWith("image/")) return;

  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
  }

  resetCanvasLayout();
  uploadedDesignFile = file;
  latestBreakdown = null;
  uploadedImageUrl = URL.createObjectURL(file);
  flyerPreview.src = uploadedImageUrl;
  flyerCore.classList.add("has-image");
  canvasPanel.classList.remove("analyzed", "analyzing", "generated-ready");
  stopLiveWebLines();
  analyzeButton.disabled = false;
  generateButton.disabled = true;
  setAwaitingUpload(false);
  ingredientStatus.textContent = "Incomplete";
  detectedCount.textContent = "0 nodes";
  textCount.textContent = "0";
  imageCount.textContent = "0";
  styleCount.textContent = "0";
  designSectionCount.textContent = "6 components";
  breakdownList.innerHTML = defaultBreakdownListMarkup;
  if (ingredientList) ingredientList.innerHTML = defaultIngredientListMarkup;
  atomWeb.innerHTML = "";
  renderWebLines();
  setColorSystemValues({ primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" });
  setStepState(1);
}

function updateCanvasFromBreakdown(breakdown) {
  if (!breakdown?.sections?.length) return;

  const sections = breakdown.sections;
  const visibleSections = sections.filter((section) => !isBrandConstantSection(section));
  const countByType = visibleSections.reduce(
    (counts, section) => {
      const type = section.type || "style";

      if (type === "image") counts.images += 1;
      else if (type === "text" || type === "action" || type === "brand") counts.text += 1;
      else counts.style += 1;

      return counts;
    },
    { text: 0, images: 0, style: 0 },
  );

  detectedCount.textContent = `${visibleSections.length} nodes`;
  textCount.textContent = countByType.text;
  imageCount.textContent = countByType.images;
  styleCount.textContent = countByType.style;

  renderBreakdownList(visibleSections);
  renderReplacementFields(visibleSections);
  applyBreakdownConstants({
    ...(breakdown.constants || {}),
    colors: extractColorsFromBreakdown(breakdown),
  });
  renderAtomCards(visibleSections);
}

async function analyzeFlyer() {
  if (!uploadedImageUrl) return;

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing...";
  ingredientStatus.textContent = "Reading";
  canvasPanel.classList.add("analyzing");

  updateWebLines();
  startLiveWebLines();

  try {
    ingredientStatus.textContent = "Preparing";
    const analysisFile = await createFastAnalysisImage(uploadedDesignFile);
    const formData = new FormData();
    formData.append("design", analysisFile);
    formData.append("aiProvider", getSelectedAiProvider());
    ingredientStatus.textContent = "Reading";

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Analysis failed.");
    }

    latestBreakdown = payload.breakdown;
    updateCanvasFromBreakdown(latestBreakdown);
    canvasPanel.classList.add("analyzed");
    setAwaitingUpload(false);
    ingredientStatus.textContent = payload.fallbackFrom === "openai" ? "Groq fallback" : payload.mode === "mock" ? "Mock ready" : "Fill blanks";
    generateButton.disabled = false;
    setStepState(2);

    window.setTimeout(() => setStepState(3), 900);
  } catch (error) {
    ingredientStatus.textContent = "Error";
    console.error(error);
    alert(error.message);
  } finally {
    canvasPanel.classList.remove("analyzing");
    stopLiveWebLines();
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze flyer";
  }
}

function resetApp() {
  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
  }

  if (uploadedSubjectUrl) {
    URL.revokeObjectURL(uploadedSubjectUrl);
  }

  resetCanvasLayout();
  uploadedImageUrl = "";
  uploadedSubjectUrl = "";
  uploadedDesignFile = null;
  uploadedSubjectFile = null;
  latestBreakdown = null;
  flyerInput.value = "";
  subjectInput.value = "";
  if (subjectUploadFeedback) subjectUploadFeedback.textContent = "No subject selected";
  if (subjectUploadButton) subjectUploadButton.textContent = "Upload replacement";
  imageLayerCard?.classList.remove("has-subject");
  const generatedCard = getGeneratedCard();
  generatedCard?.querySelector("strong") && (generatedCard.querySelector("strong").textContent = "New output");
  generatedCard?.querySelector("p") && (generatedCard.querySelector("p").textContent = "Generated design appears here after Spyda creates it.");
  generatedCard?.querySelector(".generated-preview img") && (generatedCard.querySelector(".generated-preview img").src = "assets/spyda-logo-drive.webp");
  flyerPreview.removeAttribute("src");
  flyerCore.classList.remove("has-image");
  canvasPanel.classList.remove("analyzed", "generated-ready");
  analyzeButton.disabled = true;
  generateButton.disabled = true;
  setAwaitingUpload(true);
  ingredientStatus.textContent = "Incomplete";
  detectedCount.textContent = "0 nodes";
  textCount.textContent = "0";
  imageCount.textContent = "0";
  styleCount.textContent = "0";
  designSectionCount.textContent = "6 components";
  breakdownList.innerHTML = defaultBreakdownListMarkup;
  if (ingredientList) ingredientList.innerHTML = defaultIngredientListMarkup;
  atomWeb.innerHTML = "";
  renderWebLines();
  setColorSystemValues({ primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" });
  setCanvasZoom(1);
  setStepState(0);
}

function resetCanvasLayout() {
  draggableCanvasItems.forEach((item) => {
    item.removeAttribute("style");
    item.classList.remove("dragging");
  });

  window.requestAnimationFrame(updateWebLines);
}

function collectGenerationRecipe() {
  const atomInputs = Array.from(document.querySelectorAll(".atom-card input.atom-field, .atom-card textarea.atom-field"));
  const colorSystem = getColorSystemValues();
  const brandStyle = document.querySelector("[data-brand-style]")?.value || latestBreakdown?.constants?.visualStyle || "Same as uploaded flyer";
  const editedAtoms = (latestBreakdown?.sections || []).map((section, index) => ({
    ...section,
    replacement: atomInputs.find((input) => input.dataset.atomInput === String(index))?.value || "",
  }));

  return {
    breakdown: {
      ...(latestBreakdown || {}),
      sections: editedAtoms,
    },
    headline: editedAtoms.find((atom) => `${atom.id || ""} ${atom.name || ""}`.toLowerCase().includes("hero"))?.replacement || "",
    bodyCopy: editedAtoms.find((atom) => `${atom.id || ""} ${atom.name || ""}`.toLowerCase().includes("body"))?.replacement || "",
    cta: editedAtoms.find((atom) => `${atom.id || ""} ${atom.name || ""}`.toLowerCase().includes("cta"))?.replacement || "",
    contact: editedAtoms.find((atom) => `${atom.id || ""} ${atom.name || ""}`.toLowerCase().includes("contact"))?.replacement || "",
    headingFont: canvasHeadingFontInput?.value || "Space Grotesk",
    bodyFont: canvasBodyFontInput?.value || "Montserrat",
    colors: {
      primary: colorSystem.primary,
      secondary: colorSystem.secondary,
      accent: colorSystem.accent,
    },
    visualStyle: brandStyle,
    aiProvider: getSelectedAiProvider(),
    model: getSelectedModelName(),
    format: generationFormatButton?.textContent.trim() || "Instagram Post 1:1",
    imageSize: generationSizeButton?.textContent.trim() || "Auto from format",
    quality: generationQualityButton?.textContent.trim() || "Premium",
  };
}

async function markReadyToGenerate() {
  if (!uploadedImageUrl) return;

  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  ingredientStatus.textContent = "Generating";

  try {
    const formData = new FormData();
    formData.append("recipe", JSON.stringify(collectGenerationRecipe()));
    formData.append("reference", uploadedDesignFile);

    if (uploadedSubjectFile) {
      formData.append("subject", uploadedSubjectFile);
    }

    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Generation failed.");
    }

    ingredientStatus.textContent = payload.mode === "mock" ? "Mock result" : "Ready";
    canvasPanel.classList.add("generated-ready");
    const generatedCard = getGeneratedCard();
    generatedCard.querySelector("strong").textContent = "Generated flyer";
    generatedCard.querySelector("p").textContent = payload.message || "Your new design output is connected to the source.";

    if (payload.image) {
      const outputImage = generatedCard.querySelector(".generated-preview img");
      outputImage.src = `data:image/png;base64,${payload.image}`;
    }

    updateWebLines();
    setStepState(4);
  } catch (error) {
    ingredientStatus.textContent = "Error";
    console.error(error);
    alert(error.message);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate new flyer";
  }
}

function loadSubjectImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  if (uploadedSubjectUrl) {
    URL.revokeObjectURL(uploadedSubjectUrl);
  }

  uploadedSubjectFile = file;
  uploadedSubjectUrl = URL.createObjectURL(file);
  document.querySelectorAll("[data-subject-upload]").forEach((button) => {
    button.textContent = "Replace subject";
  });
  document.querySelectorAll(".upload-feedback").forEach((feedback) => {
    feedback.textContent = file.name;
  });
  imageLayerCard?.classList.add("has-subject");

  if (uploadedImageUrl && canvasPanel.classList.contains("analyzed")) {
    ingredientStatus.textContent = "Editing";
  }
}

function getInitialFromName(name) {
  const trimmedName = name.trim();
  return trimmedName ? trimmedName[0].toUpperCase() : "S";
}

function updateAccountAvatar(imageDataUrl = profileImageDataUrl) {
  const initial = getInitialFromName(accountSettingFields.name.value);

  profileAvatarInitial.textContent = initial;

  if (imageDataUrl) {
    profileAvatarImage.src = imageDataUrl;
    profileAvatar.classList.add("has-image");
    sidebarAvatarMini.innerHTML = `<img src="${imageDataUrl}" alt="" aria-hidden="true" />`;
  } else {
    profileAvatarImage.removeAttribute("src");
    profileAvatar.classList.remove("has-image");
    sidebarAvatarMini.textContent = initial;
  }
}

function collectAccountSettings() {
  return {
    profileImage: profileImageDataUrl,
    name: accountSettingFields.name.value,
    email: accountSettingFields.email.value,
    company: accountSettingFields.company.value,
    role: accountSettingFields.role.value,
    headingFont: accountSettingFields.headingFont.value,
    bodyFont: accountSettingFields.bodyFont.value,
    primaryColor: accountSettingFields.primaryColor.value,
    secondaryColor: accountSettingFields.secondaryColor.value,
    accentColor: accountSettingFields.accentColor.value,
    visualStyle: accountSettingFields.visualStyle.value,
    model: accountSettingFields.model.value,
    format: accountSettingFields.format.value,
    quality: accountSettingFields.quality.value,
    autoSend: accountSettingFields.autoSend.checked,
  };
}

function saveAccountSettings() {
  localStorage.setItem(accountStorageKey, JSON.stringify(collectAccountSettings()));
  settingsStatus.textContent = "Saved";
  window.setTimeout(() => {
    settingsStatus.textContent = "Local";
  }, 1400);
}

function loadAccountSettings() {
  const storedSettings = localStorage.getItem(accountStorageKey);
  if (!storedSettings) {
    updateAccountAvatar("");
    return;
  }

  try {
    const settings = JSON.parse(storedSettings);

    Object.entries(accountSettingFields).forEach(([key, field]) => {
      if (!(key in settings)) return;

      if (field.type === "checkbox") {
        field.checked = Boolean(settings[key]);
      } else {
        field.value = settings[key];
      }
    });

    profileImageDataUrl = settings.profileImage || "";
    updateAccountAvatar(profileImageDataUrl);
  } catch {
    updateAccountAvatar("");
  }
}

function loadProfileImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    profileImageDataUrl = reader.result;
    updateAccountAvatar(profileImageDataUrl);
    settingsStatus.textContent = "Unsaved";
  });

  reader.readAsDataURL(file);
}

function closeDropdown(dropdown) {
  const trigger = dropdown.querySelector("[data-dropdown-trigger]");

  dropdown.classList.remove("open");
  trigger.setAttribute("aria-expanded", "false");
}

function closeAllDropdowns(exceptDropdown = null) {
  spydaDropdowns.forEach((dropdown) => {
    if (dropdown !== exceptDropdown) {
      closeDropdown(dropdown);
    }
  });
}

function toggleDropdown(dropdown) {
  const trigger = dropdown.querySelector("[data-dropdown-trigger]");
  const shouldOpen = !dropdown.classList.contains("open");

  closeAllDropdowns(dropdown);
  dropdown.classList.toggle("open", shouldOpen);
  trigger.setAttribute("aria-expanded", String(shouldOpen));
}

function selectDropdownOption(dropdown, optionButton) {
  const trigger = dropdown.querySelector("[data-dropdown-trigger]");
  const optionButtons = Array.from(dropdown.querySelectorAll('[role="option"]'));

  trigger.textContent = optionButton.textContent;
  optionButtons.forEach((button) => {
    button.setAttribute("aria-selected", String(button === optionButton));
  });

  const label = dropdown.querySelector("[role='listbox']")?.getAttribute("aria-label") || "";
  if (label === "AI model options" || label === "Generation model options") {
    syncModelButtons(optionButton.textContent.trim());
  }

  closeDropdown(dropdown);

  if (uploadedImageUrl && canvasPanel.classList.contains("analyzed")) {
    ingredientStatus.textContent = "Editing";
  }
}

function getRelativeRect(element) {
  const canvasRect = canvasStage.getBoundingClientRect();
  const rect = element.getBoundingClientRect();

  return {
    left: rect.left - canvasRect.left,
    top: rect.top - canvasRect.top,
    right: rect.right - canvasRect.left,
    bottom: rect.bottom - canvasRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function getCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getEdgeAnchor(rect, fromPoint) {
  const center = getCenter(rect);
  const dx = fromPoint.x - center.x;
  const dy = fromPoint.y - center.y;
  const horizontalPull = Math.abs(dx) / Math.max(rect.width, 1);
  const verticalPull = Math.abs(dy) / Math.max(rect.height, 1);

  if (horizontalPull > verticalPull) {
    return {
      x: dx > 0 ? rect.right : rect.left,
      y: center.y,
    };
  }

  return {
    x: center.x,
    y: dy > 0 ? rect.bottom : rect.top,
  };
}

function createWebPath(start, end) {
  const distanceX = Math.abs(end.x - start.x);
  const distanceY = Math.abs(end.y - start.y);
  const bend = Math.max(52, Math.min(168, (distanceX + distanceY) * 0.24));
  const directionX = end.x >= start.x ? 1 : -1;
  const controlOne = {
    x: start.x + bend * directionX,
    y: start.y,
  };
  const controlTwo = {
    x: end.x - bend * directionX,
    y: end.y,
  };

  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${controlOne.x.toFixed(1)} ${controlOne.y.toFixed(1)}, ${controlTwo.x.toFixed(1)} ${controlTwo.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function updateWebLines() {
  const canvasWidth = canvasStage.clientWidth;
  const canvasHeight = canvasStage.clientHeight;

  if (!webLines || canvasWidth === 0 || canvasHeight === 0) return;

  const sourceRect = getRelativeRect(flyerCore);
  const sourceCenter = getCenter(sourceRect);

  webLines.setAttribute("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);

  Array.from(webLines.querySelectorAll(".line")).forEach((path) => {
    const target = document.querySelector(`[data-node="${path.dataset.lineFor}"]`);
    if (!target) return;

    const targetRect = getRelativeRect(target);
    const targetCenter = getCenter(targetRect);
    const start = getEdgeAnchor(sourceRect, targetCenter);
    const end = getEdgeAnchor(targetRect, sourceCenter);

    path.setAttribute("d", createWebPath(start, end));
  });
}

function isInteractiveTarget(target) {
  return Boolean(target.closest("input, textarea, select, button, label"));
}

function isCanvasElementTarget(target) {
  return Boolean(target.closest(".flyer-core, .atom-card, .canvas-control-dock, .canvas-toolbar, .canvas-header, .canvas-status, .canvas-zoom-controls, [data-dropdown]"));
}

function handleCanvasWheel(event) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setCanvasZoom(canvasZoom + direction * canvasWheelZoomStep);
    return;
  }

  if (isInteractiveTarget(event.target)) return;

  event.preventDefault();

  const horizontalDelta = event.deltaX || event.deltaY;
  const verticalDelta = event.deltaY || event.deltaX;

  if (event.shiftKey) {
    canvasWorld.scrollLeft += horizontalDelta;
  } else {
    canvasWorld.scrollTop += verticalDelta;
    canvasWorld.scrollLeft += event.deltaX;
  }

  ensureInfiniteCanvasRoom();
  window.requestAnimationFrame(updateWebLines);
}

function startCanvasPan(event) {
  if (event.button !== 0 || isInteractiveTarget(event.target) || isCanvasElementTarget(event.target)) {
    return;
  }

  activeCanvasPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: canvasWorld.scrollLeft,
    scrollTop: canvasWorld.scrollTop,
  };

  canvasWorld.classList.add("panning");
  canvasWorld.setPointerCapture(event.pointerId);
}

function moveCanvasPan(event) {
  if (!activeCanvasPan || activeCanvasPan.pointerId !== event.pointerId) return;

  canvasWorld.scrollLeft = activeCanvasPan.scrollLeft - (event.clientX - activeCanvasPan.startX);
  canvasWorld.scrollTop = activeCanvasPan.scrollTop - (event.clientY - activeCanvasPan.startY);
  ensureInfiniteCanvasRoom();
  window.requestAnimationFrame(updateWebLines);
}

function stopCanvasPan(event) {
  if (!activeCanvasPan || activeCanvasPan.pointerId !== event.pointerId) return;

  canvasWorld.classList.remove("panning");

  if (canvasWorld.hasPointerCapture(event.pointerId)) {
    canvasWorld.releasePointerCapture(event.pointerId);
  }

  activeCanvasPan = null;
}

function getCanvasPoint(event) {
  const rect = canvasStage.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function autoPanCanvasDuringDrag(event) {
  const rect = canvasWorld.getBoundingClientRect();
  const edgeSize = 76;
  const maxStep = 34;
  let panX = 0;
  let panY = 0;

  if (event.clientX < rect.left + edgeSize) {
    panX = -Math.ceil(((rect.left + edgeSize - event.clientX) / edgeSize) * maxStep);
  } else if (event.clientX > rect.right - edgeSize) {
    panX = Math.ceil(((event.clientX - (rect.right - edgeSize)) / edgeSize) * maxStep);
  }

  if (event.clientY < rect.top + edgeSize) {
    panY = -Math.ceil(((rect.top + edgeSize - event.clientY) / edgeSize) * maxStep);
  } else if (event.clientY > rect.bottom - edgeSize) {
    panY = Math.ceil(((event.clientY - (rect.bottom - edgeSize)) / edgeSize) * maxStep);
  }

  if (!panX && !panY) return;

  canvasWorld.scrollLeft += panX;
  canvasWorld.scrollTop += panY;
  ensureInfiniteCanvasRoom();
}

function enableCanvasDrag(item) {
  item.addEventListener("pointerdown", startCanvasDrag);
  item.addEventListener("pointermove", moveCanvasDrag);
  item.addEventListener("pointerup", stopCanvasDrag);
  item.addEventListener("pointercancel", stopCanvasDrag);
}

function prepareForDrag(item) {
  const itemRect = item.getBoundingClientRect();
  const canvasRect = canvasStage.getBoundingClientRect();

  item.style.left = `${itemRect.left - canvasRect.left}px`;
  item.style.top = `${itemRect.top - canvasRect.top}px`;
  item.style.right = "auto";
  item.style.bottom = "auto";
  item.style.transform = "none";
}

function getDragBounds(item) {
  return {
    maxX: canvasStage.clientWidth - item.offsetWidth,
    maxY: canvasStage.clientHeight - item.offsetHeight,
  };
}

function startCanvasDrag(event) {
  if (window.matchMedia("(max-width: 900px)").matches || isInteractiveTarget(event.target)) {
    return;
  }

  const item = event.currentTarget;
  const point = getCanvasPoint(event);
  const itemRect = item.getBoundingClientRect();
  const canvasRect = canvasStage.getBoundingClientRect();

  prepareForDrag(item);

  activeDrag = {
    item,
    offsetX: point.x - (item.getBoundingClientRect().left - canvasRect.left),
    offsetY: point.y - (item.getBoundingClientRect().top - canvasRect.top),
  };

  item.classList.add("dragging");
  item.setPointerCapture(event.pointerId);
}

function moveCanvasDrag(event) {
  if (!activeDrag) return;

  autoPanCanvasDuringDrag(event);

  const { item, offsetX, offsetY } = activeDrag;
  const point = getCanvasPoint(event);
  const bounds = getDragBounds(item);
  const nextX = Math.min(Math.max(point.x - offsetX, 0), Math.max(bounds.maxX, 0));
  const nextY = Math.min(Math.max(point.y - offsetY, 0), Math.max(bounds.maxY, 0));

  item.style.left = `${nextX}px`;
  item.style.top = `${nextY}px`;
  updateWebLines();
}

function stopCanvasDrag(event) {
  if (!activeDrag) return;

  activeDrag.item.classList.remove("dragging");
  updateWebLines();

  if (activeDrag.item.hasPointerCapture(event.pointerId)) {
    activeDrag.item.releasePointerCapture(event.pointerId);
  }

  activeDrag = null;
}

flyerInput.addEventListener("change", (event) => {
  loadFlyer(event.target.files[0]);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  loadFlyer(event.dataTransfer.files[0]);
});

analyzeButton.addEventListener("click", analyzeFlyer);
resetButton.addEventListener("click", handleTopbarAction);
generateButton.addEventListener("click", markReadyToGenerate);
canvasZoomOutButton.addEventListener("click", () => setCanvasZoom(canvasZoom - 0.15));
canvasZoomInButton.addEventListener("click", () => setCanvasZoom(canvasZoom + 0.15));
window.addEventListener("resize", () => {
  syncCanvasStageSize();
  updateWebLines();
});

if ("ResizeObserver" in window) {
  const canvasResizeObserver = new ResizeObserver(() => {
    window.requestAnimationFrame(() => {
      syncCanvasStageSize();
      updateWebLines();
    });
  });

  [canvasPanel, canvasWorld, canvasStage, flyerCore, atomWeb].filter(Boolean).forEach((item) => {
    canvasResizeObserver.observe(item);
  });
}

canvasWorld.addEventListener("scroll", () => {
  ensureInfiniteCanvasRoom();
  updateWebLines();
});
canvasWorld.addEventListener("wheel", handleCanvasWheel, { passive: false });
canvasWorld.addEventListener("pointerdown", startCanvasPan);
canvasWorld.addEventListener("pointermove", moveCanvasPan);
canvasWorld.addEventListener("pointerup", stopCanvasPan);
canvasWorld.addEventListener("pointercancel", stopCanvasPan);

railViewButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

spydaDropdowns.forEach((dropdown) => {
  const trigger = dropdown.querySelector("[data-dropdown-trigger]");
  const optionButtons = Array.from(dropdown.querySelectorAll('[role="option"]'));

  trigger.addEventListener("click", () => toggleDropdown(dropdown));

  optionButtons.forEach((button) => {
    button.addEventListener("click", () => selectDropdownOption(dropdown, button));
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-dropdown]")) {
    closeAllDropdowns();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllDropdowns();
  }
});

subjectUploadButton?.addEventListener("click", () => {
  subjectInput.click();
});

subjectInput.addEventListener("change", (event) => {
  loadSubjectImage(event.target.files[0]);
});

profileImageButton.addEventListener("click", () => {
  profileImageInput.click();
});

profileImageInput.addEventListener("change", (event) => {
  loadProfileImage(event.target.files[0]);
});

removeProfileImageButton.addEventListener("click", () => {
  profileImageDataUrl = "";
  profileImageInput.value = "";
  updateAccountAvatar("");
  settingsStatus.textContent = "Unsaved";
});

saveSettingsButton.addEventListener("click", saveAccountSettings);

Object.values(accountSettingFields).forEach((field) => {
  field.addEventListener("input", () => {
    updateAccountAvatar();
    settingsStatus.textContent = "Unsaved";
  });

  field.addEventListener("change", () => {
    updateAccountAvatar();
    settingsStatus.textContent = "Unsaved";
  });
});

document.querySelectorAll(".ingredient-list input, .ingredient-list textarea, .constants input").forEach((field) => {
  field.addEventListener("input", () => {
    const constantsInputs = Array.from(document.querySelectorAll(".constants input"));

    if (constantsInputs.includes(field) && constantsInputs.indexOf(field) >= 2) {
      setColorSystemValues({
        primary: constantsInputs[2]?.value,
        secondary: constantsInputs[3]?.value,
        accent: constantsInputs[4]?.value,
      });
    }

    if (uploadedImageUrl && canvasPanel.classList.contains("analyzed")) {
      ingredientStatus.textContent = "Editing";
    }
  });
});

atomWeb.addEventListener("click", (event) => {
  if (event.target.closest("[data-subject-upload]")) {
    subjectInput.click();
  }
});

atomWeb.addEventListener("input", (event) => {
  const target = event.target;

  if (target.matches("[data-color-role]")) {
    syncColorControl(target.dataset.colorRole, target.value, true);
  }

  if (target.matches("[data-hex-role]")) {
    syncColorControl(target.dataset.hexRole, target.value, false);
  }

  if (target.matches(".atom-field")) {
    if (target.dataset.fontRole === "heading" && canvasHeadingFontInput) {
      canvasHeadingFontInput.value = target.value;
    }

    if (target.dataset.fontRole === "body" && canvasBodyFontInput) {
      canvasBodyFontInput.value = target.value;
    }

    ingredientStatus.textContent = "Editing";
    window.requestAnimationFrame(updateWebLines);
  }
});

atomWeb.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!target.matches("[data-hex-role]")) return;

  const color = normalizeHexColor(target.value);
  target.value = color || getColorSystemValues()[target.dataset.hexRole];
  syncColorControl(target.dataset.hexRole, target.value, true);
});

[canvasHeadingFontInput, canvasBodyFontInput].filter(Boolean).forEach((input) => {
  input.addEventListener("input", () => {
    const role = input === canvasHeadingFontInput ? "heading" : "body";
    const atomFontInput = document.querySelector(`[data-font-role="${role}"]`);
    if (atomFontInput) atomFontInput.value = input.value;

    if (uploadedImageUrl && canvasPanel.classList.contains("analyzed")) {
      ingredientStatus.textContent = "Editing";
    }
  });
});

draggableCanvasItems.forEach((item) => {
  item.addEventListener("pointerdown", startCanvasDrag);
  item.addEventListener("pointermove", moveCanvasDrag);
  item.addEventListener("pointerup", stopCanvasDrag);
  item.addEventListener("pointercancel", stopCanvasDrag);
});

loadAccountSettings();
centerCanvasView();
