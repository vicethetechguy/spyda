import { cp, mkdir, rm } from "node:fs/promises";

const outputDir = "dist";
const files = [
  "index.html",
  "workspace.html",
  "pricing.html",
  "signin.html",
  "signup.html",
  "recording.html",
  "styles.css",
  "landing.css",
  "favicon.svg",
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of files) {
  await cp(file, `${outputDir}/${file}`);
}

await cp("assets", `${outputDir}/assets`, { recursive: true });

console.log("Spyda static site prepared in dist/");
