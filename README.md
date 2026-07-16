# MedSutra AI: AI Medical Translator & Safety App

RxBridge is a full-stack web application designed for Indian patients to translate complex medical prescriptions into plain, understandable language. It focus on safety by detecting drug-drug interactions and providing dietary warnings.

## Key Features
- **AI-Powered Prescription Scanner**: Uses Google Gemini Vision AI to directly analyze prescription images — no OCR needed.
- **Grounded Medical Assistant**: Uses configurable Gemini 3.5 Flash with retrieved trusted knowledge, prescription context, and consent-based patient memory.
- **Multilingual Support**: Instant translation to Hindi and Marathi.
- **Safety Engine**: Intelligent detection of drug-drug interactions and allergy conflicts.
- **Auto-Generated Timetable**: Visual 4-slot dosage schedule (Morning, Afternoon, Evening, Night).
- **Find Nearby Pharmacies**: Integrated Google Maps for locating open pharmacies.
- **Secure Accounts & Consultations**: Email/password sign-in, encrypted local records, signed HttpOnly sessions, and consultation requests for chat, phone, or future video care.
- **Partner-ready Workflows**: Configurable Mem0 memory, Gnani speech-to-text, Slashy caregiver-email drafting, and GenZDeal pharmacy discounts.

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Tesseract.js.
- **Backend**: Node.js Express (Serving static files & API).
- **AI**: Google Gemini API via `@google/genai`.
- **Icons**: Lucide React.
- **Animation**: Motion (Framer Motion).

## Setup Instructions

### 1. Environment Variables
Create a `.env` file from `.env.example`:
```env
GEMINI_API_KEY="your_api_key_here"
DATA_ENCRYPTION_KEY="long-random-secret"
AUTH_SESSION_SECRET="different-long-random-secret"
GOOGLE_MAPS_API_KEY="your_api_key_here"
```

Use `.env.example` for the full optional Mem0, Gnani, Slashy, GenZDeal, Qdrant, and support configuration. Never commit a populated `.env` file.

### RAG knowledge base

For production retrieval, set `QDRANT_URL`, `QDRANT_API_KEY`, and `QDRANT_COLLECTION`. Store only reviewed documents in the collection with this payload shape:

```json
{ "title": "Document title", "text": "Reviewed medical content", "source": "Trusted source", "tags": ["topic"] }
```

The server generates Gemini embeddings, searches Qdrant, injects the retrieved context into Gemini, and falls back to the included safety knowledge only when Qdrant is not configured. Update the collection to refresh knowledge without retraining a model.

### Security notes

The server refuses to use default encryption and session secrets in production. Serve the app over HTTPS, configure a managed database/key vault for production, and complete applicable HIPAA/GDPR and partner-vendor reviews before handling real patient data.

### 2. Local Development
```bash
npm install
npm run dev
```
The app will run on `http://localhost:3000`.

### 3. Docker Deployment
```bash
docker build -t rxbridge .
docker run -p 3000:3000 rxbridge
```

### 4. Cloud Run Deployment
Use the provided `cloudbuild.yaml` or run:
```bash
gcloud run deploy rxbridge --source .
```

## Folder Structure
- `/src/components`: UI Views (Scan, Profile, Result).
- `/src/services`: AI and Translation logic.
- `/src/data`: Shorthand and interaction JSON datasets.
- `/server.ts`: Express backend entry point and protected API routes.
- `/server/auth.ts`: Encrypted account, session, password reset, and consultation storage.
- `/server/medical.ts`: RAG retrieval plus Mem0, Gnani, Slashy, and GenZDeal adapters.
- `/Dockerfile`: Containerization config.

## Disclaimer
MedSutra AI is an AI assistant and should not be used as a replacement for professional medical advice. Always consult your doctor or pharmacist.
