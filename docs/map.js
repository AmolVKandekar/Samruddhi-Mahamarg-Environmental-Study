const payload = JSON.parse(document.querySelector('#evidence-data').textContent);
const topic = document.querySelector('#topic');
const map = document.querySelector('#map');
const context = map.getContext('2d');
const entries = document.querySelector('#entries');
const panel = document.querySelector('#assessment');
const count = document.querySelector('#count');
const palette = new Map(payload.topics.map((value, index) => [value, ['#aad789', '#f4cb80', '#98ded3', '#e19b80'][index]]));
let shown = payload.points.features;
let selected = shown[0];
let scale;

function node(tag, content, className) {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function draw() {
  const density = Math.min(devicePixelRatio || 1, 2);
  const width = map.clientWidth;
  const height = map.clientHeight;
  if (!width || !height) return;
  map.width = width * density;
  map.height = height * density;
  context.scale(density, density);
  scale = ([lon, lat]) => [26 + (lon - 72.85) / 6.05 * (width - 55), 24 + (21.07 - lat) / 2.04 * (height - 63)];
  context.fillStyle = '#111d1d';
  context.fillRect(0, 0, width, height);
  context.font = '11px monospace';
  context.fillStyle = '#bbcdc4';
  context.strokeStyle = '#344944';
  for (let longitude = 73; longitude <= 78; longitude += width < 430 ? 2 : 1) {
    const [x] = scale([longitude, 20]);
    context.beginPath(); context.moveTo(x, 20); context.lineTo(x, height - 30); context.stroke();
    context.fillText(`${longitude}°E`, x - 14, height - 14);
  }
  for (const latitude of [19.5, 20, 20.5, 21]) {
    const [, y] = scale([74, latitude]);
    context.beginPath(); context.moveTo(17, y); context.lineTo(width - 18, y); context.stroke();
  }

  const activeIds = new Set(shown.map(feature => feature.properties.id));
  for (const buffer of payload.buffers.features) {
    if (!activeIds.has(buffer.properties.id)) continue;
    const ring = buffer.geometry.coordinates[0].map(scale);
    context.beginPath(); context.moveTo(...ring[0]);
    for (const point of ring.slice(1)) context.lineTo(...point);
    const color = palette.get(buffer.properties.topic);
    context.fillStyle = `${color}27`;
    context.strokeStyle = `${color}74`;
    context.fill(); context.stroke();
  }

  for (const feature of shown) {
    const [x, y] = scale(feature.geometry.coordinates);
    const current = feature === selected;
    context.beginPath(); context.arc(x, y, current ? 7 : 4, 0, Math.PI * 2);
    context.fillStyle = palette.get(feature.properties.topic); context.fill();
    if (current) {
      context.lineWidth = 2; context.strokeStyle = '#f4f0db'; context.stroke();
      context.lineWidth = 1;
    }
  }
}

function choose(feature) {
  selected = feature;
  const data = feature.properties;
  for (const button of entries.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.record === data.id));
  }
  panel.replaceChildren(node('h2', data.location, 'assessment-heading'));
  panel.firstElementChild.id = 'assessment-title';
  panel.append(node('p', `${data.topic} · ${data.phase} · ${data.evidence}`, 'label'));
  for (const [label, text] of [['Assessment', data.assessment], ['Mitigation', data.mitigation], ['Measurement', data.measurement]]) {
    panel.append(node('h3', label), node('p', text));
  }
  if (data.source) {
    const link = node('a', data.source.title);
    link.href = data.source.url;
    panel.append(link);
  }
  draw();
}

function list() {
  shown = payload.points.features.filter(feature => !topic.value || feature.properties.topic === topic.value);
  entries.replaceChildren();
  count.textContent = `${shown.length} ${shown.length === 1 ? 'record' : 'records'}`;
  for (const feature of shown) {
    const data = feature.properties;
    const button = node('button', `${data.location} · ${data.topic}`);
    button.type = 'button';
    button.dataset.record = data.id;
    button.style.setProperty('--topic', palette.get(data.topic));
    button.addEventListener('click', () => choose(feature));
    entries.append(button);
  }
  choose(shown.includes(selected) ? selected : shown[0]);
}

for (const value of payload.topics.filter(value => shown.some(feature => feature.properties.topic === value))) {
  const option = node('option', value);
  option.value = value;
  topic.append(option);
}
topic.addEventListener('change', list);
map.addEventListener('click', event => {
  const bounds = map.getBoundingClientRect();
  const closest = shown.find(feature => {
    const [x, y] = scale(feature.geometry.coordinates);
    return Math.hypot(x - (event.clientX - bounds.left), y - (event.clientY - bounds.top)) <= 10;
  });
  if (closest) choose(closest);
});
new ResizeObserver(draw).observe(map);
list();
