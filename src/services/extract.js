const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

pdfjsLib.GlobalWorkerOptions.workerSrc = '';

async function extractWithPdfjs(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter(item => item.str?.trim())
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width ?? 0,
      }));

    if (!items.length) continue;

    // Regroupe les mots par ligne (tolérance verticale 3pt)
    const LINE_TOL = 3;
    const lines = [];
    for (const item of items) {
      const line = lines.find(l => Math.abs(l.y - item.y) <= LINE_TOL);
      if (line) line.items.push(item);
      else lines.push({ y: item.y, items: [item] });
    }

    // Trie les lignes de haut en bas (y décroissant dans les coords PDF)
    lines.sort((a, b) => b.y - a.y);

    const pageText = lines.map(line => {
      line.items.sort((a, b) => a.x - b.x);

      let text = '';
      let prevRight = line.items[0].x;

      for (const item of line.items) {
        const gap = item.x - prevRight;
        // Gros écart = séparateur de colonne, petit écart = espace normal
        if (gap > 30) text += '  |  ';
        else if (gap > 8) text += ' ';
        text += item.str;
        prevRight = item.x + item.w;
      }

      return text.trim();
    }).filter(Boolean).join('\n');

    pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extract(pdfBuffer) {
  try {
    const text = await extractWithPdfjs(pdfBuffer);
    if (text.trim().length > 100) return text;
    throw new Error('Extraction pdfjs vide ou insuffisante');
  } catch (err) {
    // Fallback sur pdf-parse si pdfjs échoue (PDF scanné, corrompu, etc.)
    console.warn('pdfjs-dist fallback vers pdf-parse:', err.message);
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer);
    return data.text;
  }
}

module.exports = { extract };
