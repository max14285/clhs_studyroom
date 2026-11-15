var SeatMap = (function () {
  var STATUS_CLS = { '預約': 's-res', '在位': 's-in', '暫離': 's-away', '離場': 's-out' };

  /**
   * render(root, layout, opts)
   *  opts.mode: 'student' | 'live' | 'edit'
   *  student: opts.seats {seatId:'t'|'m'}  opts.onClick(item)
   *  live:    opts.occ   {seatId:{cls,no,status,...}}  opts.onClick(item)
   *  edit:    opts.selected(Set) opts.onDown(item,ev) opts.onBgDown(ev) opts.grid opts.scale
   * 回傳 {els, scale, canvas, wrap}
   */
  function floorOf(it) { return String(it.floor == null || it.floor === '' ? '1' : it.floor); }
  function floorsOf(L, extra) {
    var m = {}, a = [];
    L.items.concat((extra || []).map(function (f) { return { floor: f }; })).forEach(function (i) { var f = floorOf(i); if (!m[f]) { m[f] = 1; a.push(f); } });
    a.sort(function (x, y) { var nx = Number(x), ny = Number(y); return (isNaN(nx) || isNaN(ny)) ? (x < y ? -1 : x > y ? 1 : 0) : nx - ny; });
    return a.length ? a : ['1'];
  }
  /** 樓層頁籤。sub(f) 可回傳小字（例如「剩 12 位」）；只有一層樓且沒有 sub 時隱藏。onAdd 有值就多一顆「＋樓層」 */
  function floorTabs(el, L, cur, onPick, sub, extra, onAdd) {
    var fl = floorsOf(L, extra);
    el.innerHTML = '';
    el.className = 'fl-tabs';
    if (fl.length < 2 && !onAdd) return;
    fl.forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'chip' + (f === String(cur) ? ' on' : '');
      b.textContent = f + 'F';
      if (sub) { var s = sub(f); if (s) { var sm = document.createElement('small'); sm.textContent = s; b.appendChild(sm); } }
      b.onclick = function () { onPick(f); };
      el.appendChild(b);
    });
    if (onAdd) {
      var a = document.createElement('button'); a.className = 'chip'; a.textContent = '＋樓層'; a.onclick = onAdd; el.appendChild(a);
    }
  }

  function render(root, L, o) {
    o = o || {};
    var fl = String(o.floor || floorsOf(L)[0]);
    var items = L.items.filter(function (it) { return floorOf(it) === fl; })
      .sort(function (a, b) { return (a.type === 'room' ? 0 : 1) - (b.type === 'room' ? 0 : 1); });   // 教室外框畫在最底層
    var prev = root.querySelector('.sm-wrap');
    var keep = prev ? [prev.scrollLeft, prev.scrollTop] : null;
    root.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'sm-wrap';
    var avail = root.clientWidth || L.w;
    var s = o.scale || Math.min(1, Math.max(0.3, (avail - 4) / L.w));
    var holder = document.createElement('div');
    holder.style.cssText = 'position:relative;width:' + (L.w * s) + 'px;height:' + (L.h * s) + 'px';
    var cv = document.createElement('div');
    cv.className = 'sm-canvas' + (o.grid ? ' grid' : '');
    cv.style.cssText = 'width:' + L.w + 'px;height:' + L.h + 'px;transform:scale(' + s + ')' + (o.mode === 'edit' ? ';touch-action:none' : '');
    if (o.onBgDown) cv.addEventListener('pointerdown', function (e) { if (e.target === cv) o.onBgDown(e); });
    var els = {};
    items.forEach(function (it) {
      var el = document.createElement('div');
      var cls = 'sm-item sm-' + it.type, sub = '';
      if (it.type === 'seat') {
        if (o.mode === 'edit') { cls += ' edit' + (it.active ? '' : ' off'); }
        else if (!it.active) cls += ' off';
        else if (o.mode === 'live') {
          var oc = o.occ && o.occ[it.id];
          if (oc) { cls += ' ' + (STATUS_CLS[oc.status] || ''); sub = oc.cls + '-' + oc.no + '\n' + oc.status; }
        } else {
          var st = o.seats && o.seats[it.id];
          if (st === 'm') { cls += ' mine'; sub = '我的'; }
          else if (st) { cls += ' taken'; sub = '已預約'; }
        }
      } else if (o.mode === 'edit') cls += ' edit';
      if (o.selected && o.selected.has(it.id)) cls += ' sel';
      el.className = cls;
      el.style.cssText = 'left:' + it.x + 'px;top:' + it.y + 'px;width:' + it.w + 'px;height:' + it.h + 'px;transform:rotate(' + it.rot + 'deg)';
      var inner = document.createElement('span');
      inner.className = 'sm-in';
      inner.style.transform = 'rotate(' + (-it.rot) + 'deg)';
      var b = document.createElement('b'); b.textContent = it.label; inner.appendChild(b);
      if (sub) {
        sub.split('\n').forEach(function (line) {
          var sm = document.createElement('small'); sm.textContent = line; inner.appendChild(sm);
        });
      }
      el.appendChild(inner);
      if (o.onClick && it.type === 'seat') el.addEventListener('click', function (ev) { o.onClick(it, ev); });
      if (o.onDown) el.addEventListener('pointerdown', function (ev) { o.onDown(it, ev); });
      el.dataset.id = it.id;
      cv.appendChild(el);
      els[it.id] = el;
    });
    holder.appendChild(cv); wrap.appendChild(holder); root.appendChild(wrap);
    if (keep) { wrap.scrollLeft = keep[0]; wrap.scrollTop = keep[1]; }
    return { els: els, scale: s, canvas: cv, wrap: wrap };
  }

  function legend(mode) {
    var d = function (bg, bd, t) { return '<span><i style="background:' + bg + ';border-color:' + bd + '"></i>' + t + '</span>'; };
    if (mode === 'live') {
      return '<div class="legend">' + d('#fef9c3', '#eab308', '預約（未到）') + d('#dcfce7', '#16a34a', '在位') + d('#ffedd5', '#f97316', '暫離') +
        d('#e5e7eb', '#9ca3af', '離場') + d('#f0fdf4', '#86efac', '空位') + '</div>';
    }
    return '<div class="legend">' + d('#f0fdf4', '#86efac', '可預約') + d('#e5e7eb', '#9ca3af', '已被預約') + d('#dbeafe', '#2563eb', '我的座位') + d('#f3f4f6', '#d1d5db', '停用') + '</div>';
  }
  return { render: render, legend: legend, floorsOf: floorsOf, floorTabs: floorTabs, floorOf: floorOf };
})();
