#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RSS_PATH = path.join(ROOT, 'rss', 'index.html');
const SITE_TITLE = 'Matt Webber: Dev + Entrepreneur';
const SITE_DESC = '||: travel, code, make music :||';
const SITE_URL = 'https://mattwebber.me/';
const AUTHOR = 'Matt Webber';

const SKIP_DIRS = new Set(['author', 'rss', 'assets', 'public', 'content', '.git', 'node_modules', 'memory', 'memory-hooks-drafts']);

function metaContent(html, property) {
  const m = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i'))
           || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s) {
  return s
    .replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, '/').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function extractContent(html) {
  // Grab everything inside <section class="gh-content gh-canvas"> up to <aside
  const m = html.match(/<section[^>]*class="gh-content gh-canvas"[^>]*>([\s\S]*?)<\/section>/);
  if (!m) return '';
  return m[1].replace(/<aside[\s\S]*$/, '').trim();
}

function toRFC822(dateStr) {
  return new Date(dateStr).toUTCString();
}

// Preserve existing GUIDs so feed readers don't re-show old items
const existingGuids = {};
if (fs.existsSync(RSS_PATH)) {
  const xml = fs.readFileSync(RSS_PATH, 'utf8');
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const linkM = m[1].match(/<link>([^<]+)<\/link>/);
    const guidM = m[1].match(/<guid[^>]*>([^<]+)<\/guid>/);
    if (linkM && guidM) existingGuids[linkM[1].trim()] = guidM[1].trim();
  }
}

// Collect posts
const posts = [];
for (const entry of fs.readdirSync(ROOT)) {
  if (SKIP_DIRS.has(entry)) continue;
  const dir = path.join(ROOT, entry);
  if (!fs.statSync(dir).isDirectory()) continue;
  const htmlPath = path.join(dir, 'index.html');
  if (!fs.existsSync(htmlPath)) continue;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const pubDate = metaContent(html, 'article:published_time');
  if (!pubDate) continue;

  const title   = metaContent(html, 'og:title');
  const desc    = metaContent(html, 'og:description');
  const ogUrl   = metaContent(html, 'og:url');
  const imgUrl  = metaContent(html, 'og:image');
  const content = extractContent(html);

  const link = ogUrl || `${SITE_URL}${entry}/`;
  const guid = existingGuids[link] || `${entry}-${pubDate.slice(0, 10)}`;

  posts.push({ title, desc, link, pubDate, guid, imgUrl, content });
}

posts.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

function cdata(s) { return `<![CDATA[${s || ''}]]>`; }
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let items = '';
for (const p of posts) {
  items += `<item>`;
  items += `<title>${cdata(p.title)}</title>`;
  items += `<description>${cdata(p.desc ? `<p>${p.desc}</p>` : '')}</description>`;
  items += `<link>${p.link}</link>`;
  items += `<guid isPermaLink="false">${p.guid}</guid>`;
  items += `<dc:creator>${cdata(AUTHOR)}</dc:creator>`;
  items += `<pubDate>${toRFC822(p.pubDate)}</pubDate>`;
  if (p.imgUrl) items += `<media:content url="${esc(p.imgUrl)}" medium="image"/>`;
  items += `<content:encoded>${cdata(p.content)}</content:encoded>`;
  items += `</item>`;
}

const rss = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:media="http://search.yahoo.com/mrss/">`,
  `<channel>`,
  `<title>${cdata(SITE_TITLE)}</title>`,
  `<description>${cdata(SITE_DESC)}</description>`,
  `<link>${SITE_URL}</link>`,
  `<image><url>${SITE_URL}favicon.png</url><title>${SITE_TITLE}</title><link>${SITE_URL}</link></image>`,
  `<generator>mattwebber.me</generator>`,
  `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
  `<atom:link href="${SITE_URL}rss/" rel="self" type="application/rss+xml"/>`,
  `<ttl>60</ttl>`,
  items,
  `</channel>`,
  `</rss>`,
].join('');

fs.writeFileSync(RSS_PATH, rss);
console.log(`RSS regenerated: ${posts.length} posts`);
for (const p of posts) console.log(`  ${p.pubDate.slice(0, 10)}  ${p.title}`);
