// Cloudflare Worker entry: /api/* -> Yahoo proxy, everything else -> public/ (static assets).
import { handleApi } from './api/yahoo.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request);
    return env.ASSETS.fetch(request);
  },
};
