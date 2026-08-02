/** Routes static assets + BOFU pages + trial nurture API (Resend). */
import { handleTrialNurtureRequest } from './trialNurture.js';
import { parseInviteCode, serveInvitePage } from './invitePage.js';
import { serveCareJoinPage } from './careJoinPage.js';

function injectGaMeasurementId(html, gaMeasurementId) {
  const id = (gaMeasurementId || '').trim();
  if (!id) {
    return html;
  }
  return html.replaceAll('__GA_MEASUREMENT_ID__', id);
}

async function serveHtmlAsset(env, origin, assetPath, request) {
  const response = await env.ASSETS.fetch(new Request(`${origin}${assetPath}`, request));
  if (response.status !== 200) {
    return null;
  }
  const body = injectGaMeasurementId(await response.text(), env.GA_MEASUREMENT_ID);
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

const BOFU_HTML = {
  '/diabetes-food-scanner': '/diabetes-food-scanner.html',
  '/compare/myfitnesspal': '/compare/myfitnesspal.html',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/api/trial-nurture') {
      return handleTrialNurtureRequest(request, env);
    }

    if (path === '/api/engagement-push') {
      const secret = env.ENGAGEMENT_PUSH_CRON_SECRET;
      const provided =
        request.headers.get('x-cron-secret') ||
        new URL(request.url).searchParams.get('secret') ||
        '';
      if (!secret || provided !== secret) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      const url =
        env.ENGAGEMENT_PUSH_URL ||
        'https://evyhbqophmysfjxxlfce.supabase.co/functions/v1/send-engagement-push';
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cron-secret': secret,
        },
        body: await request.text().catch(() => '{}') || '{}',
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path === '/google25004a03e8ddf3c2.html') {
      return new Response('google-site-verification: google25004a03e8ddf3c2.html\n', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }

    if (path === '/.well-known/assetlinks.json') {
      const asset = await env.ASSETS.fetch(
        new Request(`${url.origin}/.well-known/assetlinks.json`, request),
      );
      if (asset.status === 200) {
        const body = await asset.text();
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=300',
          },
        });
      }
    }

    if (path === '/.well-known/apple-app-site-association' || path === '/apple-app-site-association') {
      const asset = await env.ASSETS.fetch(
        new Request(`${url.origin}/.well-known/apple-app-site-association`, request),
      );
      if (asset.status === 200) {
        const body = await asset.text();
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=300',
          },
        });
      }
    }

    if (path === '/' || path === '') {
      const home = await serveHtmlAsset(env, url.origin, '/index.html', request);
      if (home) {
        return home;
      }
    }

    const bofuAsset = BOFU_HTML[path];
    if (bofuAsset) {
      const page = await serveHtmlAsset(env, url.origin, bofuAsset, request);
      if (page) {
        return page;
      }
    }

    if (parseInviteCode(path)) {
      return serveInvitePage(request, env, url);
    }

    if (path.startsWith('/care/join/')) {
      return serveCareJoinPage(request, env, url);
    }

    if (path === '/care' || path === '/care/') {
      const care = await serveHtmlAsset(env, url.origin, '/care/_entry', request);
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
        const care = await serveHtmlAsset(env, url.origin, '/care/_entry', request);
        if (care) {
          return care;
        }
      }
      return asset;
    }

    if (path.startsWith('/blog/')) {
      const slug = path.slice('/blog/'.length).replace(/\/$/, '');
      if (slug && !slug.includes('.') && !slug.includes('/')) {
        const page = await serveHtmlAsset(env, url.origin, `/blog/${slug}.html`, request);
        if (page) {
          return page;
        }
      }
    }

    return env.ASSETS.fetch(request);
  },

  /**
   * IST engagement slots (approx UTC):
   * 08:15 → 02:45 · 10:00 → 04:30 · 13:30 → 08:00 · 14:15 → 08:45
   * 17:00 → 11:30 · 19:00 → 13:30 · 20:30 → 15:00
   */
  async scheduled(_controller, env, _ctx) {
    const url =
      env.ENGAGEMENT_PUSH_URL ||
      'https://evyhbqophmysfjxxlfce.supabase.co/functions/v1/send-engagement-push';
    const secret = env.ENGAGEMENT_PUSH_CRON_SECRET;
    if (!secret) {
      console.warn('[engagement-push] ENGAGEMENT_PUSH_CRON_SECRET not set');
      return;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cron-secret': secret,
        },
        body: '{}',
      });
      const text = await res.text();
      console.log('[engagement-push]', res.status, text.slice(0, 500));
    } catch (e) {
      console.error('[engagement-push] failed', e);
    }
  },
};
