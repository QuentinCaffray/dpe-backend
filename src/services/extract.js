const pdfParse = require('pdf-parse');

async function extract(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  return data.text;
}

module.exports = { extract };
