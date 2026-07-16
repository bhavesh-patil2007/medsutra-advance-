import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured." });

  const { prompt, imageBase64, imageMimeType } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required." });

  const contents = imageBase64
    ? [{ parts: [{ inline_data: { mime_type: imageMimeType || "image/jpeg", data: imageBase64 } }, { text: prompt }] }]
    : [{ parts: [{ text: prompt }] }];

  const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

  let lastError = '';

  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }),
      });
      if (!r.ok) {
        const detail = await r.text();
        lastError = `${model} returned HTTP ${r.status}: ${detail.slice(0, 500)}`;
        console.error(`[Gemini proxy] ${lastError}`);
        continue;
      }
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response.";
      return res.json({ result: text });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[Gemini proxy] ${model} network failure:`, error);
    }
  }
  return res.status(503).json({
    error: "All Gemini models unavailable.",
    details: process.env.NODE_ENV === 'production' ? undefined : lastError,
  });
}
