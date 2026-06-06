const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

function pickModel(featureType, textLen, hasImage) {
  if (!CLAUDE_KEY) return 'gemini';
  if (['analisis', 'draft'].includes(featureType)) return 'claude';
  if (hasImage) return 'claude';
  if (textLen > 220) return 'claude';
  return 'gemini';
}

async function callGemini(prompt, image, imageMime) {
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: imageMime || 'image/jpeg', data: image } });
  parts.push({ text: prompt });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } })
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    if (resp.status === 429) throw new Error('Limit harian Gemini tercapai. Coba lagi besok.');
    throw new Error(e.error?.message || `Gemini error ${resp.status}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callClaude(prompt, image, imageMime) {
  const content = image
    ? [{ type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: image } }, { type: 'text', text: prompt }]
    : [{ type: 'text', text: prompt }];
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content }] })
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Claude error ${resp.status}`);
  }
  const data = await resp.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GEMINI_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi. Tambahkan GEMINI_API_KEY di Vercel.' });
  try {
    const { prompt = '', featureType = 'tanya', textLen = 0, image = null, imageMime = null } = req.body || {};
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt tidak boleh kosong.' });
    const model = pickModel(featureType, textLen, !!image);
    const result = model === 'claude' ? await callClaude(prompt, image, imageMime) : await callGemini(prompt, image, imageMime);
    return res.status(200).json({ result, model });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
