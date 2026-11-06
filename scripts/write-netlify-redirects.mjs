import { writeFile } from 'node:fs/promises';

const configuredOrigin = process.env.NETLIFY_API_ORIGIN?.trim();
if (!configuredOrigin) {
  throw new Error('Set NETLIFY_API_ORIGIN to the HTTPS origin of the Flask backend before building for Netlify.');
}

let apiOrigin;
try {
  apiOrigin = new URL(configuredOrigin);
} catch {
  throw new Error('NETLIFY_API_ORIGIN must be a valid HTTPS origin, such as https://api.school.example.com.');
}

if (
  apiOrigin.protocol !== 'https:'
  || !apiOrigin.hostname
  || apiOrigin.username
  || apiOrigin.password
  || apiOrigin.pathname !== '/'
  || apiOrigin.search
  || apiOrigin.hash
) {
  throw new Error('NETLIFY_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.');
}

const origin = apiOrigin.origin;
const redirects = [
  `/api/* ${origin}/api/:splat 200`,
  `/uploads/* ${origin}/uploads/:splat 200`,
  '/* /index.html 200',
  '',
].join('\n');

await writeFile('dist/_redirects', redirects, 'utf8');
console.log(`Wrote Netlify API and upload proxy rules for ${origin}.`);
