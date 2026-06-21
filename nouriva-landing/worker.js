/** SPA fallback for the care provider portal at /care/* */
async function serveCareApp(request, env, origin) {
  const indexResponse = await env.ASSETS.fetch(
    new Request(`${origin}/care/index.html`, { method: 'GET', headers: request.headers }),
  );
  const body = await indexResponse.text();
  if (!body) {
    return new Response('Care portal unavailable', { status: 503 });
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

    if (path === '/care' || path === '/care/') {
      return serveCareApp(request, env, url.origin);
    }

    if (path.startsWith('/care/')) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status === 200) {
        return asset;
      }
      if (!path.includes('.')) {
        return serveCareApp(request, env, url.origin);
      }
      return asset;
    }

    return env.ASSETS.fetch(request);
  },
};
