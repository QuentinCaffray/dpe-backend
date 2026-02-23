const { extract } = require('../services/extract');
const { vulgarize } = require('../services/vulgarize');
const { generate } = require('../services/generate');

async function processPdf(req, res) {
  try {
    const pdfFile = req.files?.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'Aucun fichier PDF fourni' });
    }

    if (pdfFile.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Le fichier doit être un PDF' });
    }

    // Options de personnalisation
    let customization = {};
    try {
      if (req.body.customization) {
        customization = JSON.parse(req.body.customization);
      }
    } catch (e) {
      // JSON malformé, on utilise les valeurs par défaut
    }

    const logoFile = req.files?.logo?.[0] || null;
    const coverFile = req.files?.cover?.[0] || null;
    const endPageFiles = req.files?.endPages || [];
    const buildingPhotoFiles = req.files?.buildingPhotos || [];

    // Parse photo captions
    let photoCaptions = [];
    try {
      if (req.body.photoCaptions) {
        photoCaptions = JSON.parse(req.body.photoCaptions);
      }
    } catch (e) {
      // JSON malformé, on utilise un tableau vide
    }

    const extractedText = await extract(pdfFile.buffer);
    const vulgarizedContent = await vulgarize(extractedText);
    const pdfBuffer = await generate(vulgarizedContent, pdfFile.originalname, {
      primaryColor: customization.primaryColor || '#5590ee',
      secondaryColor: customization.secondaryColor || '#3b7dd8',
      logoBuffer: logoFile?.buffer || null,
      logoMime: logoFile?.mimetype || null,
      coverBuffer: coverFile?.buffer || null,
      coverMime: coverFile?.mimetype || null,
      endPages: endPageFiles.map(f => ({ buffer: f.buffer, mime: f.mimetype })),
      buildingPhotos: buildingPhotoFiles.map((f, i) => ({
        buffer: f.buffer,
        mime: f.mimetype,
        caption: photoCaptions[i] || '',
      })),
    });

    const outputName = pdfFile.originalname.replace('.pdf', '_simplifie.pdf');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${outputName}"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Erreur de traitement:', error);
    res.status(500).json({ error: error.message || 'Erreur lors du traitement du PDF' });
  }
}

module.exports = { processPdf };
