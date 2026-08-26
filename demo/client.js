const rawInput = document.getElementById('rawInput');
const angleInput = document.getElementById('angleInput');
const stopsInput = document.getElementById('stopsInput');
const renderButton = document.getElementById('renderButton');
const status = document.getElementById('status');
const danmakuText = document.getElementById('danmakuText');
const meta = document.getElementById('meta');
const modelOutput = document.getElementById('modelOutput');
const wireOutput = document.getElementById('wireOutput');

function escapeText(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function colorToCss(color, alpha = 1) {
  return `#${Number(color).toString(16).padStart(6, '0')}${alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, '0') : ''}`;
}

async function render() {
  status.className = 'status';
  status.textContent = '正在转换…';
  try {
    const raw = JSON.parse(rawInput.value);
    const stops = JSON.parse(stopsInput.value);
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw, gradient: { angle: Number(angleInput.value), stops } }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.item) throw new Error((payload.diagnostics ?? []).map((entry) => entry.message ?? entry.code).join('; ') || '原始数据无法转换');
    const item = payload.item;
    const diagnostics = payload.diagnostics ?? [];
    const generated = item.effects?.find((effect) => effect.type === 'gradient' && effect.origin === 'generated');
    const cssStops = generated?.source?.type === 'linear'
      ? generated.source.stops.map((stop) => `${colorToCss(Number.parseInt(stop.color.slice(1), 16), stop.alpha)} ${stop.position * 100}%`).join(', ')
      : colorToCss(item.color);
    danmakuText.textContent = item.text;
    danmakuText.style.background = generated?.source?.type === 'linear' ? `linear-gradient(${generated.source.angle}deg, ${cssStops})` : cssStops;
    danmakuText.style.webkitBackgroundClip = 'text';
    danmakuText.style.backgroundClip = 'text';
    danmakuText.style.color = 'transparent';
    meta.innerHTML = `<span>time: ${item.time}s</span><span>mode: ${escapeText(item.mode)}</span><span>fontSize: ${item.fontSize}</span><span>base color: ${colorToCss(item.color)}</span><span>effects: ${item.effects?.length ?? 0}</span>`;
    modelOutput.textContent = JSON.stringify(item, null, 2);
    wireOutput.textContent = JSON.stringify({ p: payload.wire.p, m: payload.wire.m, diagnostics }, null, 2);
    status.textContent = diagnostics.length ? `转换完成，${diagnostics.length} 条诊断` : '转换成功，无诊断';
    if (diagnostics.length) status.className = 'status error';
  } catch (error) {
    status.className = 'status error';
    status.textContent = `转换失败：${error.message}`;
    modelOutput.textContent = '无有效模型';
    wireOutput.textContent = JSON.stringify({ error: error.message }, null, 2);
    danmakuText.textContent = '输入有误';
    danmakuText.style.background = 'none';
    danmakuText.style.color = '#fda4af';
    meta.textContent = '';
  }
}

renderButton.addEventListener('click', render);
angleInput.addEventListener('change', render);
render();
