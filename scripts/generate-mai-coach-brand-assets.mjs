import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRuntimeSharp = "/Users/joederario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp";

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    const explicit = process.env.SHARP_MODULE_PATH;
    if (explicit) return require(explicit);
    try {
      return require(defaultRuntimeSharp);
    } catch {
      throw new Error("Install sharp or set SHARP_MODULE_PATH to generate MAI Coach brand assets.");
    }
  }
}

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error("Usage: node scripts/generate-mai-coach-brand-assets.mjs /path/to/logo-sheet.png");
}

const sharp = loadSharp();
const outputDir = resolve(root, "public/brand/mai-coach");
const source = sharp(sourcePath);
const metadata = await source.metadata();

if (metadata.width !== 2172 || metadata.height !== 724) {
  throw new Error(`Unexpected source dimensions ${metadata.width}x${metadata.height}; expected 2172x724.`);
}

const crops = [
  {
    name: "mai-coach-full-horizontal-v2.png",
    crop: { left: 32, top: 118, width: 1310, height: 438 },
    resize: { width: 1200 },
  },
  {
    name: "mai-coach-compact-horizontal-v2.png",
    crop: { left: 1468, top: 100, width: 680, height: 190 },
    resize: { width: 760 },
  },
  {
    name: "mai-coach-stacked-v2.png",
    crop: { left: 1480, top: 360, width: 570, height: 280 },
    resize: { width: 720 },
  },
  {
    name: "mai-coach-mark-v2.png",
    crop: { left: 42, top: 168, width: 470, height: 405 },
    resize: { width: 640 },
  },
  {
    name: "mai-coach-mark-circle-v2.png",
    crop: { left: 1468, top: 360, width: 288, height: 288 },
    resize: { width: 512 },
  },
  {
    name: "mai-coach-email-v2.png",
    crop: { left: 1468, top: 100, width: 680, height: 190 },
    resize: { width: 640 },
  },
];

for (const item of crops) {
  await sharp(sourcePath)
    .extract(item.crop)
    .resize({ ...item.resize, withoutEnlargement: false })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(outputDir, item.name));
}

const markPath = resolve(outputDir, "mai-coach-mark-v2.png");
const circlePath = resolve(outputDir, "mai-coach-mark-circle-v2.png");
const iconSizes = [
  ["mai-coach-icon-16-v2.png", 16, markPath],
  ["mai-coach-icon-32-v2.png", 32, markPath],
  ["mai-coach-apple-touch-icon-v2.png", 180, circlePath],
  ["mai-coach-pwa-192-v2.png", 192, circlePath],
  ["mai-coach-pwa-512-v2.png", 512, circlePath],
  ["mai-coach-maskable-512-v2.png", 512, circlePath],
];

for (const [name, size, input] of iconSizes) {
  const padding = name.includes("maskable") ? Math.round(size * 0.1) : Math.round(size * 0.05);
  const resized = await sharp(input)
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#07110d",
    },
  })
    .composite([{
      input: resized.data,
      left: Math.round((size - resized.info.width) / 2),
      top: Math.round((size - resized.info.height) / 2),
    }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(outputDir, name));
}

await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: "#07110d",
  },
})
  .composite([
    {
      input: await sharp(resolve(outputDir, "mai-coach-full-horizontal-v2.png"))
        .resize({ width: 1020, withoutEnlargement: true })
        .png()
        .toBuffer(),
      top: 105,
      left: 90,
    },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(resolve(outputDir, "mai-coach-og-v2.png"));

console.log(`Generated MAI Coach brand assets from ${sourcePath}`);
