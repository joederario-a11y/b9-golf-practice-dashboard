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
  throw new Error("Usage: node scripts/generate-mai-coach-brand-assets.mjs /path/to/new-mai-coach-logo.png");
}

const sharp = loadSharp();
const outputDir = resolve(root, "public/brand/mai-coach");
const metadata = await sharp(sourcePath).metadata();

if (metadata.width !== 1536 || metadata.height !== 1024) {
  throw new Error(`Unexpected source dimensions ${metadata.width}x${metadata.height}; expected 1536x1024.`);
}

const canonicalGreen = { r: 150, g: 203, b: 57 };
const darkInk = { r: 16, g: 23, b: 31 };

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function extensionlessName(name) {
  return name.replace(/\.[^.]+$/, "");
}

async function transparentLogoBuffer(crop, resize, options = {}) {
  const { data, info } = await sharp(sourcePath)
    .extract(crop)
    .resize(resize)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const sourceAlpha = data[index + 3] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const greenDominance = g - Math.max(r, b);
    const greenScore = clamp((greenDominance + saturation * 0.55 - 10) * 2.4, 0, 255);
    const whiteScore = clamp((max - 145) * 2.6 - Math.max(0, saturation - 28) * 1.4, 0, 255);
    const edgeScore = clamp((max - 105) * 1.1 + saturation * 0.45 - 55, 0, 130);
    const alpha = Math.round(Math.max(greenScore, whiteScore, edgeScore) * sourceAlpha);
    if (options.lightVariant && alpha > 0 && whiteScore >= greenScore) {
      output[index] = darkInk.r;
      output[index + 1] = darkInk.g;
      output[index + 2] = darkInk.b;
    } else if (alpha > 0 && greenScore > whiteScore) {
      output[index] = Math.round((r + canonicalGreen.r * 1.4) / 2.4);
      output[index + 1] = Math.round((g + canonicalGreen.g * 1.4) / 2.4);
      output[index + 2] = Math.round((b + canonicalGreen.b * 1.4) / 2.4);
    } else {
      output[index] = r;
      output[index + 1] = g;
      output[index + 2] = b;
    }
    output[index + 3] = alpha < 18 ? 0 : alpha;
  }
  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeTransparentAsset(name, crop, resize, options = {}) {
  const input = await transparentLogoBuffer(crop, resize, options);
  await sharp(input)
    .extend({
      top: options.paddingY ?? 0,
      bottom: options.paddingY ?? 0,
      left: options.paddingX ?? 0,
      right: options.paddingX ?? 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(outputDir, name));
}

const fullCrop = { left: 330, top: 350, width: 870, height: 220 };
const compactCrop = { left: 355, top: 360, width: 815, height: 150 };
const markCrop = { left: 310, top: 330, width: 295, height: 305 };

await writeTransparentAsset("mai-coach-logo-horizontal-dark-v3.png", fullCrop, { width: 1200 }, { paddingX: 24, paddingY: 18 });
await writeTransparentAsset("mai-coach-logo-horizontal-light-v3.png", fullCrop, { width: 1200 }, { lightVariant: true, paddingX: 24, paddingY: 18 });
await writeTransparentAsset("mai-coach-logo-horizontal-no-tagline-dark-v3.png", compactCrop, { width: 1100 }, { paddingX: 20, paddingY: 14 });
await writeTransparentAsset("mai-coach-logo-horizontal-no-tagline-light-v3.png", compactCrop, { width: 1100 }, { lightVariant: true, paddingX: 20, paddingY: 14 });
await writeTransparentAsset("mai-coach-logo-compact-v3.png", compactCrop, { width: 760 }, { paddingX: 16, paddingY: 12 });
await writeTransparentAsset("mai-coach-logo-email-v3.png", compactCrop, { width: 640 }, { paddingX: 18, paddingY: 12 });
await writeTransparentAsset("mai-coach-mark-v3.png", markCrop, { width: 512, height: 512, fit: "contain" }, { paddingX: 64, paddingY: 64 });

const markPath = resolve(outputDir, "mai-coach-mark-v3.png");
const iconSizes = [
  ["mai-coach-favicon-16-v3.png", 16, markPath, 0.08],
  ["mai-coach-favicon-32-v3.png", 32, markPath, 0.08],
  ["mai-coach-favicon-48-v3.png", 48, markPath, 0.08],
  ["mai-coach-apple-touch-icon-v3.png", 180, markPath, 0.12],
  ["mai-coach-pwa-192-v3.png", 192, markPath, 0.12],
  ["mai-coach-pwa-512-v3.png", 512, markPath, 0.12],
  ["mai-coach-maskable-512-v3.png", 512, markPath, 0.18],
];

for (const [name, size, input, padRatio] of iconSizes) {
  const padding = Math.round(size * padRatio);
  const resized = await sharp(input)
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#10171F",
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
    background: "#10171F",
  },
})
  .composite([
    {
      input: await sharp(resolve(outputDir, "mai-coach-logo-horizontal-dark-v3.png"))
        .resize({ width: 880, withoutEnlargement: true })
        .png()
        .toBuffer(),
      top: 176,
      left: 160,
    },
    {
      input: Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect x="156" y="455" width="888" height="3" fill="#96CB39" opacity="0.75"/>
        <text x="600" y="508" fill="#F2F2F2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="1">Coach Guidance. Smarter Practice.</text>
      </svg>`),
      top: 0,
      left: 0,
    },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(resolve(outputDir, "mai-coach-social-1200x630-v3.png"));

const generated = [
  "mai-coach-logo-horizontal-dark-v3.png",
  "mai-coach-logo-horizontal-light-v3.png",
  "mai-coach-logo-horizontal-no-tagline-dark-v3.png",
  "mai-coach-logo-horizontal-no-tagline-light-v3.png",
  "mai-coach-logo-compact-v3.png",
  "mai-coach-logo-email-v3.png",
  "mai-coach-mark-v3.png",
  ...iconSizes.map(([name]) => name),
  "mai-coach-social-1200x630-v3.png",
];

for (const name of generated) {
  const path = resolve(outputDir, name);
  const info = await sharp(path).metadata();
  console.log(`${extensionlessName(name)} ${info.width}x${info.height}`);
}

console.log(`Generated MAI Coach brand assets from ${sourcePath}`);
