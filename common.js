/* 共用：DOM 小工具、Toast／Modal、Google 登入、呼叫 Apps Script API */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtDay(ds) {
  const d = new Date(ds + 'T12:00:00');
  return (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日一二三四五六'[d.getDay()] + '）';
}
function errMsg(e) {
  let m = String((e && e.message) || e || '發生錯誤').replace(/^(Error|Exception):\s*/i, '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = '無法連線到伺服器，請檢查網路，或確認 config.js 的 API_URL 與部署權限（須為「任何人」）';
  return m;
}

let _toastT = null;
function toast(msg, type) {
  const old = $('.toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.remove(), type === 'bad' ? 5000 : 3000);
}

/** modal({title, body:(html|Node), buttons:[{text,cls,onClick(close)}], onClose}) */
function modal(o) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = '<div class="mdl"><h3></h3><div class="mb"></div><div class="mf"></div></div>';
  $('h3', ov).textContent = o.title || '';
  const mb = $('.mb', ov);
  if (typeof o.body === 'string') mb.innerHTML = o.body; else if (o.body) mb.appendChild(o.body);
  const mf = $('.mf', ov);
  function close() { ov.remove(); if (o.onClose) o.onClose(); }
  (o.buttons || [{ text: '關閉' }]).forEach(b => {
    const bt = document.createElement('button');
    bt.className = 'btn ' + (b.cls || '');
    bt.textContent = b.text;
    bt.onclick = async () => {
      if (b.onClick) { bt.disabled = true; const r = await b.onClick(close); bt.disabled = false; if (r === false) return; }
      close();
    };
    mf.appendChild(bt);
  });
  document.body.appendChild(ov);
  return { el: ov, close };
}

/* ---------------- Google 登入（ID Token） ---------------- */
const Auth = { token: '', exp: 0, email: '', waiters: [], ready: null, loginEl: null };

function jwtInfo(tok) {
  try {
    const p = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { exp: Number(p.exp) * 1000, email: String(p.email || '').toLowerCase() };
  } catch (e) { return { exp: 0, email: '' }; }
}
function setToken(tok) {
  const i = jwtInfo(tok);
  Auth.token = tok; Auth.exp = i.exp; Auth.email = i.email;
  try { sessionStorage.setItem('sr_idt', tok); } catch (e) {}
  if (Auth.loginEl) { Auth.loginEl.remove(); Auth.loginEl = null; }
  const el = $('#acctEmail'); if (el) el.textContent = Auth.email;
  Auth.waiters.splice(0).forEach(f => f());
}
function tokenValid() { return Auth.token && Auth.exp - 90000 > Date.now(); }

/** 載入 Google 登入元件並初始化；回傳 Promise（元件就緒即 resolve，不代表已登入） */
function initAuth() {
  if (Auth.ready) return Auth.ready;
  Auth.ready = new Promise((ok, ng) => {
    try { const t = sessionStorage.getItem('sr_idt'); if (t) { const i = jwtInfo(t); if (i.exp - 90000 > Date.now()) setToken(t); } } catch (e) {}
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: window.APP_CONFIG.CLIENT_ID, callback: r => setToken(r.credential),
        auto_select: true, use_fedcm_for_prompt: true, cancel_on_tap_outside: false
      });
      ok();
    };
    s.onerror = () => { Auth.ready = null; s.remove(); ng(new Error('無法載入 Google 登入元件（網路被擋？）')); };
    document.head.appendChild(s);
  });
  return Auth.ready;
}

/** 顯示登入畫面並等到登入完成 */
function needLogin(msg) {
  return new Promise(async resolve => {
    Auth.waiters.push(resolve);
    if (Auth.loginEl) return;
    await initAuth();
    const ov = document.createElement('div');
    ov.className = 'ov'; ov.style.zIndex = 300;
    ov.innerHTML = '<div class="mdl" style="text-align:center"><h3>請使用學校 Google 帳號登入</h3><p class="mut">' + esc(msg || '登入後才能使用本頁') + '</p><div id="gbtn" style="display:flex;justify-content:center;margin:14px 0"></div></div>';
    document.body.appendChild(ov); Auth.loginEl = ov;
    google.accounts.id.renderButton($('#gbtn', ov), { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'zh-TW' });
    try { google.accounts.id.prompt(); } catch (e) {}
  });
}

function signOut() {
  Auth.token = ''; Auth.exp = 0; Auth.email = '';
  try { sessionStorage.removeItem('sr_idt'); } catch (e) {}
  try { google.accounts.id.disableAutoSelect(); } catch (e) {}
  location.reload();
}

/** 呼叫 Apps Script 函式（與 google.script.run 同名同參數）。登入過期會自動要求重新登入並重試一次 */
async function api(fn, ...args) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!tokenValid()) await needLogin(attempt ? '登入已過期，請重新登入' : '');
    const r = await fetch(window.APP_CONFIG.API_URL, {
      method: 'POST', redirect: 'follow',
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(45000) : undefined,   // 伺服器卡住時 45 秒後放棄，交給暫存佇列重試
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },       // 不用 application/json，避免瀏覽器 CORS 預檢
      body: JSON.stringify({ idToken: Auth.token, fn: fn, args: args })
    });
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('伺服器回應格式錯誤（請確認 API_URL 是 /exec 網址，且部署為「任何人」可存取）'); }
    if (j.ok) return j.result;
    if (j.code === 'AUTH' && attempt === 0) { Auth.token = ''; Auth.exp = 0; continue; }
    const e = new Error(j.error || '發生錯誤'); e.code = j.code; throw e;
  }
}
