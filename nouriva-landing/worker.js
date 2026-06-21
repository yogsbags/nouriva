/** Routes static assets + SPA fallbacks for landing (/) and care portal (/care/*). */
async function serveHtmlAsset(env, origin, assetPath, request) {
  const response = await env.ASSETS.fetch(new Request(`${origin}${assetPath}`, request));
  if (response.status !== 200) {
    return null;
  }
  const body = await response.text();
  if (!body) {
    return null;
  }
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '') {
      const home = await serveHtmlAsset(env, url.origin, '/index.html', request);
      if (home) {
        return home;
      }
    }

    if (path === '/care' || path === '/care/') {
      const care = await serveHtmlAsset(env, url.origin, '/care/_entry.html', request);
      if (care) {
        return care;
      }
    }

    if (path.startsWith('/care/')) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status === 200) {
        return asset;
      }
      if (!path.includes('.')) {
        const care = await serveHtmlAsset(env, url.origin, '/care/_entry.html', request);
        if (care) {
          return care;
        }
      }
      return asset;
    }

    return env.ASSETS.fetch(request);
  },
};
