/** SPA fallback for the care provider portal at /care/* */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/care' || path === '/care/') {
      return env.ASSETS.fetch(new Request(`${url.origin}/care/index.html`, request));
    }

    if (path.startsWith('/care/')) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404 || path.includes('.')) {
        return asset;
      }
      return env.ASSETS.fetch(new Request(`${url.origin}/care/index.html`, request));
    }

    return env.ASSETS.fetch(request);
  },
};
