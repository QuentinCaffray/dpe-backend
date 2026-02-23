const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Chemin vers l'image de couverture par défaut
const COVER_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'couverture.png');

// ─── Utilitaires couleur ───

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

// ─── Images ───

function getCoverImageBase64() {
  try {
    if (fs.existsSync(COVER_IMAGE_PATH)) {
      const buffer = fs.readFileSync(COVER_IMAGE_PATH);
      const ext = path.extname(COVER_IMAGE_PATH).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Erreur lecture couverture:', err.message);
  }
  return null;
}

function bufferToBase64(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ─── Markdown / HTML ───

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text, noBadges = false) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Badges de priorité (sauf si noBadges est true, pour les titres)
  if (!noBadges) {
    // On utilise (?<![a-zà-ÿ]) et (?![a-zà-ÿ]) au lieu de \b pour gérer les accents
    s = s.replace(/(?<![a-zà-ÿ])(urgents?)(?![a-zà-ÿ])/gi, '<span class="badge badge-urgent">🔴 URGENT</span>');
    s = s.replace(/(?<![a-zà-ÿ])(recommandé|recommande|recommandés|recommandées)(?![a-zà-ÿ])/gi, '<span class="badge badge-recommended">⚠️ RECOMMANDÉ</span>');
    s = s.replace(/(?<![a-zà-ÿ])(optionnels?|optionnelles?)(?![a-zà-ÿ])/gi, '<span class="badge badge-optional">ℹ️ OPTIONNEL</span>');
  }

  return s;
}

function parseTableRow(line) {
  return line.split('|').slice(1, -1).map(cell => cell.trim());
}

function isSeparatorRow(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function tableToHtml(tableLines) {
  const header = parseTableRow(tableLines[0]);
  const bodyRows = tableLines.slice(1).filter(line => !isSeparatorRow(line));

  let html = '<table>';
  html += '<thead><tr>' + header.map(h => `<th>${inlineMarkdown(h)}</th>`).join('') + '</tr></thead>';
  html += '<tbody>';
  for (const row of bodyRows) {
    const cells = parseTableRow(row);
    html += '<tr>' + cells.map(c => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ─── Graphiques SVG ───

const DEPERDITION_COLORS = {
  murs: '#5590ee', toiture: '#f59e0b', menuiseries: '#10b981',
  planchers: '#ef4444', ponts_thermiques: '#8b5cf6', autres: '#94a3b8'
};

const DEPERDITION_LABELS = {
  murs: 'Murs / Façades', toiture: 'Toiture / Combles', menuiseries: 'Menuiseries',
  planchers: 'Planchers', ponts_thermiques: 'Ponts thermiques', autres: 'Autres'
};

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlicePath(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.9) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
  }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function generatePieChart(data) {
  const normalize = k => k.toLowerCase().replace(/[\s-]/g, '_');
  const entries = Object.entries(data)
    .map(([k, v]) => [normalize(k), typeof v === 'number' ? v : parseFloat(v)])
    .filter(([k, v]) => DEPERDITION_LABELS[k] && v > 0);
  if (entries.length === 0) return '';

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = 105, cy = 105, r = 85;
  let angle = 0, slices = '', legend = '', ly = 28;

  for (const [key, value] of entries) {
    const sweep = (value / total) * 360;
    const color = DEPERDITION_COLORS[key] || '#94a3b8';
    slices += `<path d="${pieSlicePath(cx, cy, r, angle, angle + sweep)}" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    legend += `<circle cx="228" cy="${ly + 6}" r="7" fill="${color}"/>`;
    legend += `<text x="242" y="${ly + 10}" font-size="12" fill="#475569" font-family="-apple-system,sans-serif">${DEPERDITION_LABELS[key]}</text>`;
    legend += `<text x="242" y="${ly + 25}" font-size="11" font-weight="600" fill="#1e293b" font-family="-apple-system,sans-serif">${Math.round(value)}%</text>`;
    ly += 38;
    angle += sweep;
  }

  const svgH = Math.max(210, ly + 15);
  return `<div class="chart-wrap"><svg viewBox="0 0 430 ${svgH}" width="100%" style="max-width:430px">${slices}${legend}</svg></div>`;
}

function generateClasseLabel(classe, title) {
  if (!classe) return '';
  classe = classe.toUpperCase();
  const classes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  if (!classes.includes(classe)) return '';

  // Couleurs officielles DPE françaises
  const colors    = ['#319834', '#34a13c', '#c9d200', '#f9ef09', '#f5b50a', '#f36c23', '#e2001a'];
  const txtColors = ['#fff',    '#fff',    '#333',    '#333',    '#333',    '#fff',    '#fff'];
  const widths    = [52, 62, 72, 82, 92, 102, 112];
  const tip = 14, barH = 22, gap = 3, sx = 22, sy = 28;
  const idx = classes.indexOf(classe);
  let bars = '';

  for (let i = 0; i < 7; i++) {
    const y = sy + i * (barH + gap);
    const w = widths[i];
    const active = i === idx;
    const pts = `${sx},${y} ${sx+w},${y} ${sx+w+tip},${y+barH/2} ${sx+w},${y+barH} ${sx},${y+barH}`;
    bars += `<polygon points="${pts}" fill="${colors[i]}" stroke="${active ? '#1e293b' : 'none'}" stroke-width="${active ? 2.5 : 0}" stroke-linejoin="round"/>`;
    bars += `<text x="${sx+13}" y="${y+15}" font-size="11" font-weight="700" fill="${txtColors[i]}" font-family="-apple-system,sans-serif">${classes[i]}</text>`;
  }

  const iy = sy + idx * (barH + gap);
  const ix = sx + widths[6] + tip + 8;
  bars += `<polygon points="${ix},${iy+barH/2-7} ${ix},${iy+barH/2+7} ${ix-9},${iy+barH/2}" fill="#1e293b"/>`;
  bars += `<text x="${ix+4}" y="${iy+15}" font-size="13" font-weight="700" fill="#1e293b" font-family="-apple-system,sans-serif">${classe}</text>`;

  const svgW = sx + widths[6] + tip + 38;
  const svgH = sy + 7 * (barH + gap) + 8;
  return `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}"><text x="${svgW/2}" y="17" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b" font-family="-apple-system,sans-serif" letter-spacing="0.8">${title}</text>${bars}</svg>`;
}

function generateEnergyLabel(data) {
  const e = generateClasseLabel(data.classe, 'CLASSE ÉNERGÉTIQUE');
  const c = generateClasseLabel(data.classe_co2, 'CLASSE CLIMAT CO₂');
  if (!e && !c) return '';
  return `<div class="chart-wrap" style="display:flex;gap:24px;flex-wrap:wrap">${e}${c}</div>`;
}

function generateBeforeAfterChart(before, after) {
  if (!before || !after) return '';
  before = before.toUpperCase();
  after = after.toUpperCase();
  const classes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  if (!classes.includes(before) || !classes.includes(after)) return '';

  const colors = ['#319834', '#34a13c', '#c9d200', '#f9ef09', '#f5b50a', '#f36c23', '#e2001a'];
  const idxBefore = classes.indexOf(before);
  const idxAfter = classes.indexOf(after);
  const colorBefore = colors[idxBefore];
  const colorAfter = colors[idxAfter];

  const barH = 32, gap = 16, sx = 120, barWidth = 200;
  const y1 = 40, y2 = y1 + barH + gap;
  const svgW = sx + barWidth + 60;
  const svgH = y2 + barH + 20;

  return `
    <div style="margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); border-radius: 12px; border: 1px solid #e2e8f0;">
      <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-width: 450px;">
        <text x="20" y="20" font-size="13" font-weight="700" fill="#1e293b" font-family="-apple-system,sans-serif">Avant / Après travaux</text>

        <text x="20" y="${y1 + 20}" font-size="12" fill="#64748b" font-family="-apple-system,sans-serif">Actuelle</text>
        <rect x="${sx}" y="${y1}" width="${barWidth}" height="${barH}" fill="${colorBefore}" rx="6"/>
        <text x="${sx + barWidth + 12}" y="${y1 + 20}" font-size="16" font-weight="700" fill="${colorBefore}" font-family="-apple-system,sans-serif">Classe ${before}</text>

        <text x="20" y="${y2 + 20}" font-size="12" fill="#64748b" font-family="-apple-system,sans-serif">Après</text>
        <rect x="${sx}" y="${y2}" width="${barWidth}" height="${barH}" fill="${colorAfter}" rx="6"/>
        <text x="${sx + barWidth + 12}" y="${y2 + 20}" font-size="16" font-weight="700" fill="${colorAfter}" font-family="-apple-system,sans-serif">Classe ${after}</text>

        ${idxAfter < idxBefore ? `<polygon points="${sx + barWidth + 4},${y2 + barH/2 - 6} ${sx + barWidth + 4},${y2 + barH/2 + 6} ${sx + barWidth - 2},${y2 + barH/2}" fill="#10b981"/>` : ''}
      </svg>
    </div>
  `;
}

function contentToHtml(text) {
  const lines = text.split('\n');
  let html = '';
  let listType = null;
  let tableBuffer = [];
  let calloutBuffer = null; // { type, content: [] }
  let sections = []; // Pour le sommaire
  let sectionCounter = 1;
  let currentSection = null;

  function closeList() {
    if (listType) { html += `</${listType}>`; listType = null; }
  }

  function flushTable() {
    if (tableBuffer.length > 0) {
      html += tableToHtml(tableBuffer);
      tableBuffer = [];
    }
  }

  function flushCallout() {
    if (calloutBuffer) {
      const types = {
        info: { icon: '💡', title: 'Info', color: '#3b82f6', bgColor: '#eff6ff' },
        warning: { icon: '⚠️', title: 'Attention', color: '#f59e0b', bgColor: '#fffbeb' },
        tip: { icon: '✅', title: 'Conseil', color: '#10b981', bgColor: '#f0fdf4' },
        danger: { icon: '🚨', title: 'Important', color: '#ef4444', bgColor: '#fef2f2' },
      };
      const config = types[calloutBuffer.type] || types.info;
      const content = calloutBuffer.content.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return `<p>${inlineMarkdown(trimmed)}</p>`;
      }).join('');

      html += `
        <div class="callout" style="border-left: 4px solid ${config.color}; background: ${config.bgColor}">
          <div class="callout-header" style="color: ${config.color}">
            <span class="callout-icon">${config.icon}</span>
            <span class="callout-title">${config.title}</span>
          </div>
          <div class="callout-content">${content}</div>
        </div>
      `;
      calloutBuffer = null;
    }
  }

  function createSectionSeparator(number, title, color) {
    sections.push({ number, title });
    return `
      <div class="section-separator" style="background: ${color}">
        <div class="section-number">${String(number).padStart(2, '0')}.</div>
        <div class="section-title">${escapeHtml(title)}</div>
      </div>
    `;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Détection des callouts (:::type et :::)
    if (trimmed.startsWith(':::')) {
      if (calloutBuffer) {
        // Fermeture du callout
        flushCallout();
        continue;
      } else {
        // Ouverture du callout
        const type = trimmed.slice(3).trim();
        if (['info', 'warning', 'tip', 'danger'].includes(type)) {
          closeList();
          flushTable();
          calloutBuffer = { type, content: [] };
          continue;
        }
      }
    }

    // Si on est dans un callout, accumuler le contenu
    if (calloutBuffer) {
      calloutBuffer.content.push(line);
      continue;
    }

    // Détection des sections principales (# Section)
    const sectionMatch = trimmed.match(/^#\s+(.+)/);
    if (sectionMatch) {
      closeList();
      flushTable();
      const colors = ['#47b5e8', '#7ed321', '#f5a623', '#4a90e2', '#bd10e0'];
      const color = colors[(sectionCounter - 1) % colors.length];
      html += createSectionSeparator(sectionCounter, sectionMatch[1], color);
      currentSection = { number: sectionCounter, title: sectionMatch[1] };
      sectionCounter++;
      continue;
    }

    const chartMatch = trimmed.match(/^<!--\s*chart-(\w+):\s*(.*?)\s*-->$/);
    if (chartMatch) {
      closeList();
      flushTable();
      try {
        const d = JSON.parse(chartMatch[2]);
        if (chartMatch[1] === 'deperditions') html += generatePieChart(d);
        else if (chartMatch[1] === 'classe') html += generateEnergyLabel(d);
      } catch (e) { /* JSON malformé, on skip */ }
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList();
      tableBuffer.push(trimmed);
      continue;
    }

    flushTable();

    const numberedMatch = trimmed.match(/^\d+\.\s+(.*)/);

    if (trimmed.startsWith('### ')) {
      closeList();
      html += `<h3>${inlineMarkdown(trimmed.slice(4), true)}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      closeList();
      html += `<h2>${inlineMarkdown(trimmed.slice(3), true)}</h2>`;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inlineMarkdown(trimmed.slice(2))}</li>`;
    } else if (numberedMatch) {
      if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inlineMarkdown(numberedMatch[1])}</li>`;
    } else if (trimmed === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${inlineMarkdown(trimmed)}</p>`;

      // Détection du graphique avant/après (pattern: "Classe D → B", "D → B", ou dans les tableaux)
      const beforeAfterMatch = trimmed.match(/(?:classe|Class)?\s*([A-G])\s*(?:→|->|vers)\s*(?:classe\s*)?([A-G])/i);
      if (beforeAfterMatch && !trimmed.startsWith('|')) {
        // Ne pas ajouter le graphique si on est dans un tableau
        html += generateBeforeAfterChart(beforeAfterMatch[1], beforeAfterMatch[2]);
      }
    }
  }

  closeList();
  flushTable();
  flushCallout();

  return { content: html, sections };
}

// ─── Génération HTML ───

function generateHTML(content, originalName, options = {}) {
  const {
    primaryColor = '#5590ee',
    secondaryColor = '#3b7dd8',
    logoBase64 = null,
    coverBase64 = null,
    endPagesBase64 = [],
    buildingPhotos = [],
  } = options;

  // Couleurs dérivées
  const lightColor = lightenColor(primaryColor, 0.3);
  const veryLightBg = lightenColor(primaryColor, 0.85);
  const veryLightBg2 = lightenColor(primaryColor, 0.95);

  // Couverture
  const coverImage = coverBase64 || getCoverImageBase64();
  const coverPage = coverImage ? `
    <div class="cover-page">
      <img src="${coverImage}" alt="Couverture"/>
    </div>
  ` : '';

  // Logo
  const logoHtml = logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="header-logo"/>` : '';

  // Conversion du contenu
  const { content: htmlContent, sections } = contentToHtml(content);

  // Extraction des infos clés pour la carte résumé
  const classeMatch = content.match(/Classe\s+énergétique\s+actuelle[^\|]*\|\s*([A-G])/i);
  const surfaceMatch = content.match(/Surface\s+habitable[^\|]*\|\s*([\d\s]+)m/i);
  const anneeMatch = content.match(/Année\s+de\s+construction[^\|]*\|\s*(\d{4})/i);
  const coutMatch = content.match(/Coût\s+annuel[^\|]*\|\s*([\d\s]+)€/i);

  const summaryCard = `
    <div class="summary-card">
      <div class="summary-title">📊 Synthèse du diagnostic</div>
      <div class="summary-grid">
        ${classeMatch ? `
          <div class="summary-item">
            <div class="summary-label">Classe énergétique</div>
            <div class="summary-value summary-value-large" style="color: ${primaryColor}">${classeMatch[1]}</div>
          </div>
        ` : ''}
        ${surfaceMatch ? `
          <div class="summary-item">
            <div class="summary-label">Surface habitable</div>
            <div class="summary-value">${surfaceMatch[1].trim()} m²</div>
          </div>
        ` : ''}
        ${anneeMatch ? `
          <div class="summary-item">
            <div class="summary-label">Année de construction</div>
            <div class="summary-value">${anneeMatch[1]}</div>
          </div>
        ` : ''}
        ${coutMatch ? `
          <div class="summary-item">
            <div class="summary-label">Coût annuel estimé</div>
            <div class="summary-value">${coutMatch[1].trim()} €</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Sommaire
  const generationDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const sommaire = sections.length > 0 ? `
    <div class="sommaire-page">
      <h1 class="sommaire-title">SOMMAIRE</h1>
      <div class="sommaire-items">
        ${sections.map(s => `
          <div class="sommaire-item">
            <span class="sommaire-number">${String(s.number).padStart(2, '0')}</span>
            <span class="sommaire-text">${escapeHtml(s.title)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Photos du bâtiment
  const photosHtml = buildingPhotos.length > 0 ? `
    <div class="photos-section">
      <h2>📸 Photos du bâtiment</h2>
      <div class="photo-grid">
        ${buildingPhotos.map((photo, i) => `
          <div class="photo-item">
            <img src="${photo.base64}" alt="Photo ${i + 1}"/>
            ${photo.caption ? `<p class="photo-caption">${escapeHtml(photo.caption)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Pages de fin
  const endPagesHtml = endPagesBase64.map((src, i) => `
    <div class="end-page">
      <img src="${src}" alt="Page de fin ${i + 1}"/>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>DPE Simplifié</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1e293b;
      line-height: 1.7;
      font-size: 14px;
      background: #ffffff;
      counter-reset: page;
    }

    /* ─── Header ─── */
    .header {
      background: linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 55%, ${lightColor} 100%);
      color: white;
      padding: 42px 48px 48px;
      position: relative;
      overflow: hidden;
    }

    .header .deco-1 {
      position: absolute;
      top: -55px;
      right: -35px;
      width: 185px;
      height: 185px;
      background: rgba(255,255,255,0.07);
      border-radius: 50%;
    }

    .header .deco-2 {
      position: absolute;
      bottom: -65px;
      right: 100px;
      width: 150px;
      height: 150px;
      background: rgba(255,255,255,0.05);
      border-radius: 50%;
    }

    .header .deco-3 {
      position: absolute;
      top: 20px;
      left: 45%;
      width: 90px;
      height: 90px;
      background: rgba(255,255,255,0.04);
      border-radius: 50%;
    }

    .header-content {
      position: relative;
      z-index: 1;
    }

    .header-logo {
      position: absolute;
      top: 20px;
      right: 28px;
      max-height: 50px;
      max-width: 120px;
      object-fit: contain;
      z-index: 2;
    }

    .header .badge {
      display: inline-block;
      background: rgba(255,255,255,0.18);
      padding: 5px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .header h1 {
      font-size: 27px;
      font-weight: 700;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
    }

    .header p {
      font-size: 13px;
      opacity: 0.78;
    }

    /* ─── Body ─── */
    .body {
      padding: 48px 48px 48px;
    }

    /* ─── Section headings ─── */
    h2 {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 34px;
      margin-bottom: 16px;
      padding: 11px 18px;
      background: linear-gradient(90deg, ${veryLightBg} 0%, ${veryLightBg2} 100%);
      border-left: 4px solid ${primaryColor};
      border-radius: 0 8px 8px 0;
      letter-spacing: -0.1px;
      page-break-after: avoid;
    }

    h2:first-child {
      margin-top: 0;
    }

    h3 {
      font-size: 14px;
      font-weight: 600;
      color: ${primaryColor};
      margin-top: 20px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      page-break-after: avoid;
    }

    h3::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      background: ${primaryColor};
      border-radius: 2px;
      flex-shrink: 0;
    }

    /* ─── Text ─── */
    p {
      margin-bottom: 10px;
      color: #475569;
      orphans: 3;
      widows: 3;
    }

    strong {
      color: #1e293b;
      font-weight: 600;
    }

    /* ─── Lists ─── */
    ul, ol {
      page-break-inside: avoid;
    }

    ul {
      list-style: none;
      margin-bottom: 14px;
      padding-left: 0;
    }

    ul li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      color: #475569;
    }

    ul li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 9px;
      width: 8px;
      height: 8px;
      background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
      border-radius: 50%;
    }

    ol {
      margin-bottom: 14px;
      padding-left: 22px;
    }

    ol li {
      margin-bottom: 8px;
      color: #475569;
    }

    /* ─── Tables ─── */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 12px;
      margin-bottom: 22px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      page-break-inside: avoid;
    }

    thead {
      background: linear-gradient(135deg, ${secondaryColor}, ${primaryColor});
    }

    th {
      text-align: left;
      padding: 12px 16px;
      font-weight: 600;
      color: #ffffff;
      font-size: 13px;
      letter-spacing: 0.2px;
    }

    td {
      padding: 12px 16px;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
      line-height: 1.6;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    tbody tr:nth-child(odd) {
      background: #ffffff;
    }

    tbody tr {
      transition: background-color 0.15s ease;
    }

    /* ─── Graphiques ─── */
    .chart-wrap {
      margin: 16px 0;
      page-break-inside: avoid;
    }

    /* ─── Page de couverture ─── */
    .cover-page {
      width: 100%;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
    }

    .cover-page img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* ─── Pages de fin ─── */
    .end-page {
      width: 100%;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-before: always;
    }

    .end-page img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* ─── Footer ─── */
    .footer {
      margin-top: 36px;
      padding: 20px 48px;
      background: linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%);
      text-align: center;
    }

    .footer p {
      color: rgba(255,255,255,0.75);
      font-size: 11px;
      margin-bottom: 2px;
    }

    /* ─── Sommaire ─── */
    .sommaire-page {
      width: 100%;
      min-height: 100vh;
      padding: 60px 60px 40px;
      background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }

    .sommaire-title {
      font-size: 28px;
      font-weight: 700;
      color: ${primaryColor};
      letter-spacing: 1.5px;
      margin-bottom: 40px;
      text-align: center;
    }

    .sommaire-date {
      text-align: center;
      font-size: 13px;
      color: #64748b;
      margin-bottom: 30px;
      font-style: italic;
    }

    .sommaire-items {
      max-width: 600px;
      margin: 0 auto;
      width: 100%;
    }

    .sommaire-item {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      margin-bottom: 8px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      transition: transform 0.2s;
    }

    .sommaire-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, ${secondaryColor}, ${primaryColor});
      color: white;
      font-size: 16px;
      font-weight: 700;
      border-radius: 8px;
      margin-right: 16px;
      flex-shrink: 0;
    }

    .sommaire-text {
      font-size: 14px;
      font-weight: 500;
      color: #1e293b;
      flex: 1;
    }

    /* ─── Carte résumé ─── */
    .summary-card {
      background: linear-gradient(135deg, ${veryLightBg} 0%, #ffffff 100%);
      border: 2px solid ${primaryColor}33;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 30px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      page-break-inside: avoid;
    }

    .summary-title {
      font-size: 18px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 20px;
      text-align: center;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .summary-item {
      background: white;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .summary-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .summary-value {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }

    .summary-value-large {
      font-size: 32px;
    }

    /* ─── Bandeaux de section ─── */
    .section-separator {
      margin: 30px -48px 20px;
      padding: 10px 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      overflow: hidden;
      border-radius: 0;
      page-break-inside: avoid;
      page-break-after: avoid;
    }

    .section-number {
      font-size: 18px;
      font-weight: 700;
      color: rgba(255,255,255,0.95);
      line-height: 1;
      flex-shrink: 0;
      min-width: 32px;
    }

    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      flex: 1;
    }

    /* ─── Photos du bâtiment ─── */
    .photos-section {
      margin-top: 30px;
      page-break-inside: avoid;
    }

    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 20px;
    }

    .photo-item {
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      background: #f8fafc;
    }

    .photo-item img {
      width: 100%;
      height: 250px;
      object-fit: cover;
      display: block;
    }

    .photo-caption {
      padding: 12px 16px;
      font-size: 13px;
      color: #475569;
      text-align: center;
      font-style: italic;
      background: #ffffff;
      margin: 0;
      line-height: 1.4;
    }

    /* ─── Encarts colorés (callouts) ─── */
    .callout {
      margin: 20px 0;
      padding: 16px 20px;
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .callout-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .callout-icon {
      font-size: 16px;
    }

    .callout-title {
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .callout-content {
      font-size: 14px;
      line-height: 1.6;
      color: #1e293b;
    }

    .callout-content p {
      margin: 6px 0;
    }

    .callout-content p:first-child {
      margin-top: 0;
    }

    .callout-content p:last-child {
      margin-bottom: 0;
    }

    /* ─── Badges de priorité ─── */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .badge-urgent {
      background: #fee2e2;
      color: #dc2626;
      border: 1px solid #fca5a5;
    }

    .badge-recommended {
      background: #fef3c7;
      color: #d97706;
      border: 1px solid #fcd34d;
    }

    .badge-optional {
      background: #dbeafe;
      color: #2563eb;
      border: 1px solid #93c5fd;
    }

    /* Badges dans les tableaux */
    td .badge {
      display: inline-block;
      vertical-align: middle;
      margin: 2px 4px 2px 0;
      line-height: normal;
    }

    /* Assurer que les cellules de tableaux ont assez d'espace pour les badges */
    td {
      min-height: 36px;
    }

    @media print {
      .photo-grid {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${coverPage}
  ${sommaire}
  <div class="header">
    <div class="deco-1"></div>
    <div class="deco-2"></div>
    <div class="deco-3"></div>
    ${logoHtml}
    <div class="header-content">
      <div class="badge">Rapport Énergétique</div>
      <h1>Votre DPE Simplifié</h1>
      <p>Basé sur : ${escapeHtml(originalName)}</p>
    </div>
  </div>

  <div class="body">
    ${summaryCard}
    ${htmlContent}
    ${photosHtml}
  </div>

  <div class="footer">
    <p>Ce document a été généré automatiquement par DPE Simplifié le ${generationDate}.</p>
    <p>Veuillez vérifier le contenu avant de le transmettre à votre client.</p>
  </div>

  ${endPagesHtml}
</body>
</html>`;
}

async function generate(content, originalName, options = {}) {
  const {
    primaryColor = '#5590ee',
    secondaryColor = '#3b7dd8',
    logoBuffer = null,
    logoMime = null,
    coverBuffer = null,
    coverMime = null,
    endPages = [],
    buildingPhotos = [],
  } = options;

  // Convertir les buffers en base64 pour le HTML
  const logoBase64 = logoBuffer && logoMime ? bufferToBase64(logoBuffer, logoMime) : null;
  const coverBase64 = coverBuffer && coverMime ? bufferToBase64(coverBuffer, coverMime) : null;
  const endPagesBase64 = endPages
    .filter(p => p.buffer && p.mime)
    .map(p => bufferToBase64(p.buffer, p.mime));
  const buildingPhotosBase64 = buildingPhotos
    .filter(p => p.buffer && p.mime)
    .map(p => ({
      base64: bufferToBase64(p.buffer, p.mime),
      caption: p.caption || '',
    }));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  await page.setContent(generateHTML(content, originalName, {
    primaryColor,
    secondaryColor,
    logoBase64,
    coverBase64,
    endPagesBase64,
    buildingPhotos: buildingPhotosBase64,
  }), { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '0', right: '0', bottom: '60px', left: '0' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width: 100%; font-size: 10px; text-align: center; color: #64748b;">
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>
    `,
  });

  await browser.close();
  return pdfBuffer;
}

module.exports = { generate };
