#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = process.cwd();
const inboxDir = path.join(root, '_image-inbox');
const processedPath = path.join(inboxDir, '.processed.json');
const postsDir = path.join(root, 'src/content/posts');
const publicImagesDir = path.join(root, 'public/content/images/posts');
const supportedExtensions = new Set(['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);

let sharp;

async function main() {
  sharp = await loadSharp();

  const args = process.argv.slice(2);
  const includeProcessed = args.includes('--all');
  const explicitFiles = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(root, arg));

  await fs.mkdir(inboxDir, { recursive: true });
  await fs.mkdir(publicImagesDir, { recursive: true });

  const posts = await loadPosts();
  if (posts.length === 0) {
    throw new Error(`No posts found in ${path.relative(root, postsDir)}`);
  }

  const processed = await loadProcessed();
  const imageFiles = explicitFiles.length > 0 ? explicitFiles : await findImages(inboxDir);
  const candidates = [];

  for (const file of imageFiles) {
    const hash = await sha256(file);
    if (!includeProcessed && processed[hash]) {
      continue;
    }

    const metadata = await sharp(file).metadata();
    const stat = await fs.stat(file);
    candidates.push({ file, hash, metadata, size: stat.size });
  }

  if (candidates.length === 0) {
    console.log(includeProcessed
      ? 'No supported images found.'
      : 'No new images found. Drop raw images into _image-inbox/ or rerun with -- --all.');
    return;
  }

  const rl = createInterface({ input, output });
  try {
    for (const candidate of candidates) {
      const relativeFile = path.relative(root, candidate.file);
      const shortHash = candidate.hash.slice(0, 12);
      const dimensions = candidate.metadata.width && candidate.metadata.height
        ? `${candidate.metadata.width}x${candidate.metadata.height}`
        : 'unknown size';

      console.log(`\n${relativeFile}`);
      console.log(`hash ${shortHash} | ${dimensions} | ${formatBytes(candidate.size)}`);

      const post = await choosePost(rl, posts);
      if (post === null) {
        break;
      }
      if (post === false) {
        continue;
      }

      const defaultAlt = post.frontmatter.imageAlt || post.frontmatter.title;
      const imageAlt = await askText(rl, 'Alt text', defaultAlt);

      const update = await askYesNo(rl, 'Generate assets and update frontmatter?', true);
      if (!update) {
        continue;
      }

      const assets = await generateAssets(candidate.file, post, shortHash);
      await updatePostFrontmatter(post.file, {
        image: assets.image,
        cardImage: assets.cardImage,
        ogImage: assets.ogImage,
        imageAlt,
      });

      processed[candidate.hash] = {
        file: relativeFile,
        post: post.frontmatter.slug,
        processedAt: new Date().toISOString(),
        assets,
      };
      await saveProcessed(processed);

      console.log(`Wrote ${assets.image}`);
      console.log(`Wrote ${assets.cardImage}`);
      console.log(`Wrote ${assets.ogImage}`);
      console.log(`Updated ${path.relative(root, post.file)}`);
    }
  } finally {
    rl.close();
  }
}

async function loadSharp() {
  try {
    const module = await import('sharp');
    return module.default;
  } catch {
    console.error('This script needs the sharp package. Install it with: npm install -D sharp');
    process.exit(1);
  }
}

async function findImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findImages(fullPath));
      continue;
    }

    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function sha256(file) {
  const buffer = await fs.readFile(file);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function loadProcessed() {
  try {
    return JSON.parse(await fs.readFile(processedPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveProcessed(processed) {
  await fs.writeFile(processedPath, `${JSON.stringify(processed, null, 2)}\n`);
}

async function loadPosts() {
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const posts = [];

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.mdx') {
      continue;
    }

    const file = path.join(postsDir, entry.name);
    const source = await fs.readFile(file, 'utf8');
    const frontmatter = parseFrontmatter(source);
    if (frontmatter.slug && frontmatter.title) {
      posts.push({ file, frontmatter });
    }
  }

  return posts.sort((a, b) => new Date(b.frontmatter.date || 0).valueOf() - new Date(a.frontmatter.date || 0).valueOf());
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const data = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    data[pair[1]] = unquoteYamlValue(pair[2].trim());
  }

  return data;
}

function unquoteYamlValue(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    const inner = value.slice(1, -1);
    return value.startsWith("'") ? inner.replaceAll("''", "'") : inner.replaceAll('\\"', '"');
  }
  return value;
}

async function choosePost(rl, posts) {
  console.log('\nChoose a post:');
  posts.forEach((post, index) => {
    const date = post.frontmatter.date ? post.frontmatter.date.slice(0, 10) : 'no date';
    console.log(`${index + 1}. ${date} - ${post.frontmatter.title}`);
  });
  console.log('s. skip');
  console.log('q. quit');

  while (true) {
    const answer = (await rl.question('Post: ')).trim().toLowerCase();
    if (answer === 'q') {
      return null;
    }
    if (answer === 's') {
      return false;
    }

    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= posts.length) {
      return posts[selected - 1];
    }

    console.log('Enter a post number, s, or q.');
  }
}

async function askText(rl, label, defaultValue) {
  const answer = await rl.question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

async function askYesNo(rl, label, defaultValue) {
  const suffix = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = (await rl.question(`${label} ${suffix} `)).trim().toLowerCase();
  if (!answer) {
    return defaultValue;
  }
  return ['y', 'yes'].includes(answer);
}

async function generateAssets(sourceFile, post, shortHash) {
  const slug = post.frontmatter.slug;
  const outputDir = path.join(publicImagesDir, slug);
  await fs.mkdir(outputDir, { recursive: true });

  const image = `/content/images/posts/${slug}/hero-${shortHash}.webp`;
  const cardImage = `/content/images/posts/${slug}/card-${shortHash}.webp`;
  const ogImage = `/content/images/posts/${slug}/og-${shortHash}.png`;

  await sharp(sourceFile)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(path.join(root, 'public', image));

  await sharp(sourceFile)
    .rotate()
    .resize({ width: 720, height: 405, fit: 'cover', position: 'attention' })
    .webp({ quality: 84 })
    .toFile(path.join(root, 'public', cardImage));

  await generateOgImage(sourceFile, post, path.join(root, 'public', ogImage));

  return { image, cardImage, ogImage };
}

async function generateOgImage(sourceFile, post, outputFile) {
  const title = post.frontmatter.title;
  const description = post.frontmatter.description || '';
  const titleLines = wrapText(title, 30).slice(0, 3);
  const descriptionLines = wrapText(description, 58).slice(0, 2);
  const titleStart = 288 - Math.max(0, titleLines.length - 1) * 38;
  const descriptionStart = titleStart + titleLines.length * 76 + 24;

  const background = await sharp(sourceFile)
    .rotate()
    .resize({ width: 1200, height: 630, fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.7, saturation: 0.82 })
    .blur(1.2)
    .png()
    .toBuffer();

  const overlay = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#111418" stop-opacity="0.82"/>
      <stop offset="0.58" stop-color="#111418" stop-opacity="0.64"/>
      <stop offset="1" stop-color="#111418" stop-opacity="0.42"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="74" y="78" width="1052" height="474" rx="0" fill="none" stroke="#f4f1e8" stroke-opacity="0.22" stroke-width="2"/>
  <text x="92" y="128" fill="#f4f1e8" font-size="24" font-family="Manrope, Arial, sans-serif" font-weight="700">Matt Webber</text>
  <text x="92" y="${titleStart}" fill="#ffffff" font-size="68" font-family="Libre Baskerville, Georgia, serif" font-weight="700">
    ${toTspans(titleLines, 92, titleStart, 76)}
  </text>
  <text x="92" y="${descriptionStart}" fill="#f4f1e8" fill-opacity="0.88" font-size="30" font-family="Manrope, Arial, sans-serif" font-weight="500">
    ${toTspans(descriptionLines, 92, descriptionStart, 42)}
  </text>
</svg>`);

  await sharp(background)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(outputFile);
}

function wrapText(text, maxCharacters) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxCharacters || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function toTspans(lines, x, y, lineHeight) {
  return lines
    .map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function updatePostFrontmatter(file, values) {
  const source = await fs.readFile(file, 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error(`No frontmatter found in ${path.relative(root, file)}`);
  }

  let frontmatter = match[1];
  for (const [key, value] of Object.entries(values)) {
    frontmatter = setFrontmatterValue(frontmatter, key, value);
  }

  const nextSource = source.replace(match[0], `---\n${frontmatter}\n---`);
  await fs.writeFile(file, nextSource);
}

function setFrontmatterValue(frontmatter, key, value) {
  const line = `${key}: ${formatYamlValue(value)}`;
  const existing = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, 'm');
  if (existing.test(frontmatter)) {
    return frontmatter.replace(existing, line);
  }

  const previousImageField = {
    image: 'description',
    cardImage: 'image',
    ogImage: 'cardImage',
    imageAlt: 'ogImage',
  };
  const preferredAnchors = [previousImageField[key], 'description', 'date', 'slug', 'title'].filter(Boolean);
  for (const anchor of preferredAnchors) {
    const anchorLine = new RegExp(`^${anchor}:\\s*.*$`, 'm');
    const match = frontmatter.match(anchorLine);
    if (match) {
      const index = match.index + match[0].length;
      return `${frontmatter.slice(0, index)}\n${line}${frontmatter.slice(index)}`;
    }
  }

  return `${frontmatter}\n${line}`;
}

function formatYamlValue(value) {
  if (/^\/[-./A-Za-z0-9_]+$/.test(value)) {
    return value;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
