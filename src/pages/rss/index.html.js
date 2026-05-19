const postModules = import.meta.glob('../../content/posts/*.mdx', { eager: true });
const site = new URL('https://mattwebber.me');

const escapeXml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export function GET() {
  const posts = Object.values(postModules)
    .map((post) => post.frontmatter)
    .sort((a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf());

  const items = posts.map((post) => {
    const link = new URL(`/${post.slug}/`, site).toString();
    const image = post.image ? new URL(post.image, site).toString() : '';

    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="true">${link}</guid>`,
      `<description>${escapeXml(post.description)}</description>`,
      `<pubDate>${new Date(post.date).toUTCString()}</pubDate>`,
      image ? `<media:content url="${escapeXml(image)}" medium="image"/>` : '',
      '</item>',
    ].join('');
  }).join('');

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    '<title>Matt Webber: Dev + Entrepreneur</title>',
    '<description>||: travel, code, make music :||</description>',
    `<link>${site.toString()}</link>`,
    items,
    '</channel>',
    '</rss>',
  ].join('');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
