import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import dotenv from "dotenv";
import {
  clearSession,
  createPasswordReset,
  requestUser,
  requireAuth,
  resetPassword,
  saveConsultation,
  setSession,
  signIn,
  signInWithProvider,
  signUp,
  createOAuthState,
  validateOAuthState,
} from "./server/auth.js";
import {
  answerMedicalQuestion,
  draftCaregiverEmail,
  findPharmacyCoupons,
  generateGemini,
  savePatientMemory,
  transcribeWithGnani,
} from "./server/medical.js";

// Load .env file for local development
dotenv.config();

// Proper ESM __dirname reconstruction
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer(): Promise<express.Express> {
  const app = express();
  const PORT = 3000;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));

  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const current = requestCounts.get(key);
    const entry = !current || current.resetAt < now ? { count: 0, resetAt: now + 60_000 } : current;
    entry.count += 1;
    requestCounts.set(key, entry);
    if (entry.count > 80 && req.path.startsWith('/api/')) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const configuredOrigin = process.env.APP_URL;
    if (origin && (!configuredOrigin || origin === configuredOrigin || origin.startsWith('http://localhost:'))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Route: TTS proxy (avoids CORS)
  app.get("/api/tts-proxy", async (req: Request, res: Response) => {
    const { q, lang } = req.query;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(q as string)}&tl=${lang}&client=tw-ob`;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Length", buffer.byteLength.toString());
    res.send(Buffer.from(buffer));
  });

  // Route: static JSON data
  app.get("/api/data/:type", async (req: Request, res: Response) => {
    const { type } = req.params;
    const allowed = ["shorthand", "interactions", "food_warnings"];
    if (!allowed.includes(type)) {
      return res.status(404).json({ error: "Data type not found" });
    }
    try {
      const filePath = path.join(__dirname, "src", "data", `${type}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      res.json(JSON.parse(data));
    } catch (err) {
      res.status(500).json({ error: "Failed to load data" });
    }
  });

  // Secure Gemini proxy route — supports both text and image (Vision)
  app.post("/api/gemini", async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const { prompt, imageBase64, imageMimeType } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "A 'prompt' string is required in the request body." });
    }

    const contents = imageBase64
      ? [
        {
          parts: [
            {
              inline_data: {
                mime_type: imageMimeType || "image/jpeg",
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ]
      : [{ parts: [{ text: prompt }] }];

    const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

    let lastError = "";

    for (const model of models) {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents }),
            }
          );

          if (geminiRes.status === 503 && attempts < maxAttempts) {
            console.log(`[${model}] 503 overload, retrying (${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
            continue;
          }
          if (geminiRes.status === 404) {
            console.error(`[${model}] 404 not found, trying next model...`);
            lastError = `Model ${model} not found`;
            break;
          }
          if (geminiRes.status === 429) {
            console.error(`[${model}] 429 quota exceeded, trying next model...`);
            lastError = `Model ${model} quota exceeded`;
            break;
          }
          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            lastError = `${model} returned HTTP ${geminiRes.status}: ${errText.slice(0, 500)}`;
            console.error(`[${model}] ${lastError}`);
            break;
          }

          const data = await geminiRes.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response from Gemini.";
          console.log(`[${model}] Success! ${imageBase64 ? '(Vision mode)' : '(Text mode)'}`);
          return res.json({ result: text });

        } catch (err) {
          console.error(`[${model}] Network error:`, err);
          lastError = "Network error contacting Gemini API";
          break;
        }
      }
    }

    console.error("All Gemini models failed. Last error:", lastError);
    return res.status(503).json({
      error: "All Gemini models are currently unavailable. Please try again in a few minutes.",
      details: process.env.NODE_ENV === 'production' ? undefined : lastError,
    });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    res.json({ user: requestUser(req) });
  });

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const user = await signUp(req.body || {});
      setSession(res, user);
      res.status(201).json({ user });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not create the account.' });
    }
  });

  app.post('/api/auth/signin', async (req: Request, res: Response) => {
    const user = await signIn(req.body || {});
    if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });
    setSession(res, user);
    res.json({ user });
  });

  app.post('/api/auth/signout', (_req: Request, res: Response) => {
    clearSession(res);
    res.status(204).end();
  });

  app.get('/api/auth/google', (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(503).send('Google sign-in is not configured on this server.');
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`;
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state: createOAuthState('google'), prompt: 'select_account' });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    console.log('GOOGLE CALLBACK HIT', req.query);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!code || !clientId || !clientSecret || !validateOAuthState('google', state)) return res.status(400).send('Google sign-in could not be verified.');
    try {
      const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
      const token = await tokenResponse.json() as { access_token?: string };
      if (!tokenResponse.ok || !token.access_token) throw new Error('No Google access token.');
      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json() as { email?: string; name?: string; email_verified?: boolean };
      if (!profileResponse.ok || !profile.email_verified) throw new Error('Google email was not verified.');
      const user = await signInWithProvider('google', { email: profile.email, name: profile.name || profile.email?.split('@')[0] });
      setSession(res, user);
      res.redirect('/');
    } catch (err) { console.log('GOOGLE CALLBACK ERROR', err);
      res.status(502).send('Google sign-in is temporarily unavailable. Please try again.');
    }
  });

  app.get('/auth/callback', (req: Request, res: Response) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') query.set(key, value);
    }
    res.redirect(`/api/auth/google/callback?${query.toString()}`);
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const token = await createPasswordReset(req.body?.email);
    const payload: { message: string; developmentResetToken?: string } = { message: 'If an account exists, a password reset message has been prepared.' };
    if (token && process.env.NODE_ENV !== 'production') payload.developmentResetToken = token;
    res.json(payload);
  });

  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    const updated = await resetPassword(req.body || {});
    if (!updated) return res.status(400).json({ error: 'The password reset link is invalid, expired, or the password is too short.' });
    res.status(204).end();
  });

  app.post('/api/consultations', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = requestUser(req)!;
      const consultation = await saveConsultation(user, req.body || {});
      res.status(201).json({ consultation });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not request the consultation.' });
    }
  });

  app.post('/api/medical-chat', requireAuth, async (req: Request, res: Response) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 2000) : '';
    if (!question) return res.status(400).json({ error: 'A question is required.' });
    try {
      const response = await answerMedicalQuestion({
        question,
        history: Array.isArray(req.body?.history) ? req.body.history.filter((item: unknown): item is { role: string; content: string } => Boolean(item && typeof (item as { role?: unknown }).role === 'string' && typeof (item as { content?: unknown }).content === 'string')).slice(-8) : [],
        prescription: req.body?.prescription,
        userId: requestUser(req)?.id,
        mode: req.body?.mode,
      });
      res.json(response);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'The medical assistant is unavailable.' });
    }
  });

  app.post('/api/memory', requireAuth, async (req: Request, res: Response) => {
    const context = typeof req.body?.context === 'string' ? req.body.context : '';
    const stored = await savePatientMemory(requestUser(req)!.id, context, req.body?.consent === true);
    res.json({ stored });
  });

  app.post('/api/slashy/draft', requireAuth, async (req: Request, res: Response) => {
    try {
      const draft = await draftCaregiverEmail({ profileName: typeof req.body?.profileName === 'string' ? req.body.profileName.slice(0, 80) : 'Patient', prescription: req.body?.prescription, recipients: Array.isArray(req.body?.recipients) ? req.body.recipients.filter((recipient: unknown): recipient is string => typeof recipient === 'string').slice(0, 5) : [] });
      res.json({ draft });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'Auto-Mail is unavailable.' });
    }
  });

  app.post('/api/discounts', requireAuth, async (req: Request, res: Response) => {
    const subtotal = Number(req.body?.subtotal);
    if (!Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 100_000) return res.status(400).json({ error: 'A valid cart subtotal is required.' });
    try {
      const coupons = await findPharmacyCoupons({ subtotal, medicineNames: Array.isArray(req.body?.medicineNames) ? req.body.medicineNames.filter((name: unknown): name is string => typeof name === 'string').slice(0, 30) : [] });
      res.json({ coupons });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'Coupon recommendations are unavailable.' });
    }
  });

  app.post('/api/voice/transcribe', requireAuth, async (req: Request, res: Response) => {
    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
    if (!audioBase64 || audioBase64.length > 8_000_000) return res.status(400).json({ error: 'A short voice recording is required.' });
    try {
      const text = await transcribeWithGnani(audioBase64, typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'audio/webm', typeof req.body?.language === 'string' ? req.body.language : 'en-IN');
      res.json({ text });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'Voice transcription is unavailable.' });
    }
  });

  // ─── NEW: Google Cloud TTS proxy — Hindi and Marathi voices ───────────────
  app.post("/api/tts", async (req: Request, res: Response) => {
    // Uses same API key as Gemini — Google Cloud key works for both
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "TTS API key not configured." });
    }

    const { text, languageCode, voiceName } = req.body;

    if (!text || !languageCode) {
      return res.status(400).json({ error: "text and languageCode are required." });
    }

    try {
      console.log(`[TTS] Requesting voice: ${languageCode} — ${voiceName || 'default'}`);

      const ttsRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode,
              name: voiceName || undefined,
              ssmlGender: "FEMALE",
            },
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: 0.9,
              pitch: 0.0,
            },
          }),
        }
      );

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        console.error("[TTS] API error:", errText);

        // If Wavenet voice not available, retry with standard voice
        if (errText.includes('voice') && voiceName?.includes('Wavenet')) {
          console.log("[TTS] Wavenet not available, retrying with standard voice...");
          const retryRes = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                input: { text },
                voice: {
                  languageCode,
                  ssmlGender: "FEMALE",
                },
                audioConfig: {
                  audioEncoding: "MP3",
                  speakingRate: 0.9,
                  pitch: 0.0,
                },
              }),
            }
          );

          if (!retryRes.ok) {
            const retryErr = await retryRes.text();
            return res.status(retryRes.status).json({ error: retryErr });
          }

          const retryData = await retryRes.json() as { audioContent?: string };
          console.log("[TTS] Standard voice success!");
          return res.json({ audioContent: retryData.audioContent });
        }

        return res.status(ttsRes.status).json({ error: errText });
      }

      const data = await ttsRes.json() as { audioContent?: string };
      console.log(`[TTS] Success! Language: ${languageCode}`);
      return res.json({ audioContent: data.audioContent });

    } catch (err) {
      console.error("[TTS] Proxy error:", err);
      return res.status(500).json({ error: "Failed to contact Google TTS API." });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built static files
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.VERCEL !== "1") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`RxBridge Server running at http://localhost:${PORT}`);
    });
  }
  return app;
}

let cachedApp: express.Express | null = null;
async function getApp() {
  if (!cachedApp) cachedApp = await startServer();
  return cachedApp;
}

if (process.env.VERCEL !== "1") {
  startServer();
}

export default async function handler(req: Request, res: Response) {
  const app = await getApp();
  app(req, res);
}
