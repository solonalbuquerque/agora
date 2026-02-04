'use strict';

/**
 * Script injetado na página /docs: painel para Agent ID e Secret.
 * Define window.__agoraAgentId e window.__agoraSecret quando o usuário preenche.
 */
const AGORA_AUTH_PANEL_SCRIPT = `
(function() {
  var style = 'padding:12px 16px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#eee;margin:12px 12px 12px 12px;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;';
  var div = document.createElement('div');
  div.id = 'agora-auth-panel';
  div.setAttribute('style', style);
  div.innerHTML = '<strong>AGORA — Auth HMAC</strong><br>' +
    '<label style="display:inline-block;margin-right:12px;margin-top:8px;">Agent ID <input id="agora-agent-id" placeholder="ag..." style="margin-left:4px;padding:4px 8px;width:280px;border-radius:4px;border:1px solid #444;"></label> ' +
    '<label style="display:inline-block;margin-right:12px;">Secret <input id="agora-secret" type="password" placeholder="secret" style="margin-left:4px;padding:4px 8px;width:320px;border-radius:4px;border:1px solid #444;"></label> ' +
    '<span style="color:#8a8;font-size:12px;display:block;margin-top:6px;">Fill these in so the protected routes (wallet, services, execute) receive HMAC headers automatically.</span>';
  function inject() {
    var swagger = document.getElementById('swagger-ui');
    if (swagger && swagger.parentNode) {
      if (!document.getElementById('agora-auth-panel')) {
        swagger.parentNode.insertBefore(div, swagger);
        document.getElementById('agora-agent-id').addEventListener('input', update);
        document.getElementById('agora-agent-id').addEventListener('change', update);
        document.getElementById('agora-secret').addEventListener('input', update);
        document.getElementById('agora-secret').addEventListener('change', update);
      }
      return true;
    }
    return false;
  }
  function update() {
    window.__agoraAgentId = (document.getElementById('agora-agent-id') && document.getElementById('agora-agent-id').value) ? document.getElementById('agora-agent-id').value.trim() : '';
    window.__agoraSecret = (document.getElementById('agora-secret') && document.getElementById('agora-secret').value) ? document.getElementById('agora-secret').value.trim() : '';
  }
  if (inject()) update(); else setInterval(function() { if (inject()) update(); }, 200);
})();
`;

/**
 * requestInterceptor (serializado para o browser): lê window.__agoraAgentId e __agoraSecret,
 * calcula HMAC-SHA256 do payload (agentId, timestamp, method, path, bodyHash) e adiciona os headers.
 */
function agoraRequestInterceptorWithBody(req) {
  const agentId = typeof window !== 'undefined' && window.__agoraAgentId;
  const secret = typeof window !== 'undefined' && window.__agoraSecret;
  if (!agentId || !secret) return Promise.resolve(req);
  const timestamp = String(Math.floor(Date.now() / 1000));
  let pathname = '/';
  let method = 'GET';
  if (req.url) {
    try { pathname = new URL(req.url).pathname; } catch (e) { pathname = req.url.split('?')[0] || '/'; }
  }
  if (req.method) method = req.method.toUpperCase();
  function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function getBody() {
    if (req.clone && typeof req.clone === 'function') return req.clone().text();
    if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    return Promise.resolve('');
  }
  return getBody().then(function(bodyText) {
    var enc = new TextEncoder();
    return crypto.subtle.digest('SHA-256', enc.encode(bodyText || '')).then(function(hash) {
      var bodyHash = toHex(hash);
      var payload = [agentId, timestamp, method, pathname, bodyHash].join('\n');
      return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function(key) { return crypto.subtle.sign('HMAC', key, enc.encode(payload)); })
        .then(function(sig) {
          req.headers = req.headers || {};
          if (typeof req.headers.set === 'function') {
            req.headers.set('X-Agent-Id', agentId);
            req.headers.set('X-Timestamp', timestamp);
            req.headers.set('X-Signature', toHex(sig));
          } else {
            req.headers['X-Agent-Id'] = agentId;
            req.headers['X-Timestamp'] = timestamp;
            req.headers['X-Signature'] = toHex(sig);
          }
          return req;
        });
    });
  });
}

module.exports = {
  getSwaggerAgoraOptions() {
    return {
      theme: {
        js: [
          { filename: 'agora-auth.js', content: AGORA_AUTH_PANEL_SCRIPT },
        ],
      },
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        requestInterceptor: agoraRequestInterceptorWithBody,
      },
    };
  },
};
