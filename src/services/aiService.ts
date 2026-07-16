import { finalizePrescription, mergeSelfConsistency } from '../utils/prescriptionEnrichment';
import { ExplainMode, Lang, PrescriptionChatMessage, PrescriptionResult, UserProfile } from '../types';
import { verifyDrugName } from '../utils/drugMatcher'; // Added the import for our new offline engine

interface GeminiImagePayload {
  base64: string;
  mimeType: string;
}

interface ScanContext {
  ocrConfidence?: number;
  profileId?: string;
  profileName?: string;
}

async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callGemini(
  prompt: string,
  image?: GeminiImagePayload,
): Promise<string> {
  const body: Record<string, unknown> = { prompt };
  if (image) {
    body.imageBase64 = image.base64;
    body.imageMimeType = image.mimeType;
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const rawBody = await response.text();
  let data: { result?: unknown; error?: unknown; details?: unknown } = {};

  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(
      `Gemini API returned a non-JSON response (HTTP ${response.status}): ${rawBody.slice(0, 300) || 'empty body'}`,
    );
  }

  if (!response.ok) {
    const baseMessage = typeof data.error === 'string' ? data.error : rawBody || response.statusText;
    const detail = typeof data.details === 'string' ? ` Details: ${data.details}` : '';
    const message = `${baseMessage}${detail}`;
    throw new Error(`Gemini API request failed (HTTP ${response.status}): ${message}`);
  }

  if (typeof data.result !== 'string' || !data.result.trim()) {
    throw new Error('Gemini API response was missing a non-empty "result" string.');
  }

  return data.result;
}

function buildExtractionPrompt(ocrText: string, profile: UserProfile, passNumber: number, imageIncluded: boolean) {
  return `
You are MedSutra AI, a prescription extraction assistant for Indian prescriptions.
Patient safety and faithful transcription are your highest priorities. Extract only what is visible in the prescription image or explicitly stated in the supplied text.

Extraction pass number: ${passNumber}
${imageIncluded ? 'Analyze the supplied prescription image directly. It has been contrast-enhanced and must be treated as the source of truth.' : 'Analyze the supplied prescription text carefully.'}
${ocrText ? `REFERENCE TEXT (may be incomplete; never let it override the image):\n${ocrText}` : 'No OCR text is provided. Do not infer missing text.'}

Patient Profile:
- Name: ${profile.name}
- Allergies: ${profile.allergies.join(', ') || 'None'}
- Special Conditions: ${[
    profile.isPregnant ? 'Pregnant' : null,
    profile.isElderly ? 'Elderly' : null,
    profile.isChild ? 'Child' : null,
    profile.isAdult ? 'Adult' : null,
  ].filter(Boolean).join(', ') || 'None'}

Indian prescription shorthand reference:
- OD = once daily; BD or BID = twice daily; TDS = thrice daily; QID = four times daily.
- SOS = as needed; Stat = immediately; Rx = prescription; h.s. or HS = at bedtime.
- AC = before food; PC = after food.

Rules:
1. Extract medicine names exactly as written; do not substitute a brand name with a guessed generic name.
2. Anti-hallucination rule: if any medicine name, dose, timing, quantity, duration, or other word is completely illegible, output the literal string "UNSURE" for that field. Never guess, invent, or use medical knowledge to fill missing handwriting.
3. Return both a patient-friendly explanation and a clinical explanation only when supported by the extracted medicine and instructions. Use "UNSURE" if the medicine or instruction is illegible.
4. Fill slots from visible timing instructions and the shorthand reference. If timing is unclear, set all slots to false and set timing to "UNSURE".
5. Extract quantityPrescribed and durationDays only when visibly written; otherwise use null.
6. If the image explicitly says "NOT VALID", "SAMPLE", "DEMO", "EDUCATIONAL", "TESTING ONLY", is a non-prescription document, or lacks the core information expected in a prescription, return invalidPrescription true with a short patient-safe invalidReason. Do not set rescanRequired for an explicitly invalid document.
7. If the entire prescription is unreadable but otherwise appears genuine, return rescanRequired true. If only part is unreadable, retain readable entries and mark uncertain fields as "UNSURE".
8. Identify interactions only for medicines confidently extracted from the prescription. Do not invent interactions for "UNSURE" entries.
9. Return only valid JSON, with no markdown or backticks.

Return this exact shape:
{
  "invalidPrescription": false,
  "invalidReason": "",
  "rescanRequired": false,
  "medicines": [
    {
      "name": "medicine name",
      "dosage": "dose",
      "timing": "timing instructions",
      "slots": {
        "morning": true,
        "afternoon": false,
        "evening": false,
        "night": true
      },
      "purpose": "simple patient-friendly explanation",
      "purposeClinical": "clinical explanation",
      "foodWarning": "food instruction if any",
      "usageAlert": "simple alert if any",
      "usageAlertClinical": "clinical alert if any",
      "caution": "simple caution if any",
      "cautionClinical": "clinical caution if any",
      "quantityPrescribed": 10,
      "durationDays": 5
    }
  ],
  "interactions": [
    {
      "severity": "High",
      "drugs": ["Drug A", "Drug B"],
      "description": "patient-friendly warning",
      "descriptionClinical": "clinical warning"
    }
  ],
  "generalWarnings": ["simple warnings"],
  "usageAlerts": ["simple usage alerts"],
  "warningsAndCautions": ["simple cautions"]
}
`;
}

function parsePrescriptionPayload(text: string): PrescriptionResult {
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean) as PrescriptionResult & { rescanRequired?: boolean; invalidPrescription?: boolean; invalidReason?: string };
  if (parsed.invalidPrescription) {
    throw new Error(`INVALID PRESCRIPTION: ${parsed.invalidReason || 'This document is not a valid medical prescription.'}`);
  }
  if (parsed.rescanRequired) {
    throw new Error('RESCAN REQUIRED: The prescription is unclear. Please capture a clearer image.');
  }

  return {
    ...parsed,
    medicines: (parsed.medicines || []).map((medicine) => ({
      ...medicine,
      quantityPrescribed: medicine.quantityPrescribed ?? null,
      durationDays: medicine.durationDays ?? null,
    })),
    interactions: parsed.interactions || [],
    generalWarnings: parsed.generalWarnings || [],
    usageAlerts: parsed.usageAlerts || [],
    warningsAndCautions: parsed.warningsAndCautions || [],
  };
}

async function extractOnce(
  prompt: string,
  image?: GeminiImagePayload,
): Promise<PrescriptionResult> {
  const text = await callGemini(prompt, image);
  return parsePrescriptionPayload(text);
}

export async function processPrescription(
  ocrText: string,
  profile: UserProfile,
  imageFile?: File | Blob,
  scanContext?: ScanContext,
): Promise<PrescriptionResult> {
  let image: GeminiImagePayload | undefined;
  if (imageFile) {
    const base64 = await fileToBase64(imageFile);
    const mimeType = imageFile instanceof File ? imageFile.type || 'image/jpeg' : 'image/jpeg';
    image = { base64, mimeType };
  }

  const prompts = [1, 2, 3].map((pass) => buildExtractionPrompt(ocrText, profile, pass, Boolean(image)));

  const settledPasses = await Promise.allSettled(
    prompts.map((prompt) => extractOnce(prompt, image)),
  );
  const passes = settledPasses
    .filter((result): result is PromiseFulfilledResult<PrescriptionResult> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (passes.length === 0) {
    const failures = settledPasses
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);

    if (failures.some((reason) => reason instanceof Error && reason.message.includes('RESCAN REQUIRED'))) {
      throw new Error('RESCAN REQUIRED: The prescription is unclear. Please capture a clearer image.');
    }

    throw new Error('AI returned invalid prescription data. Please try again.');
  }

  const seededPasses: PrescriptionResult[] = passes.map((pass) => ({
    ...pass,
    metadata: {
      scannedAt: new Date().toISOString(),
      ocrText,
      ocrConfidence: scanContext?.ocrConfidence || 0,
      profileId: scanContext?.profileId,
      profileName: scanContext?.profileName,
      trustScore: 0,
      trustBreakdown: {
        ocrClarity: scanContext?.ocrConfidence || 0,
        nameMatch: 0,
        selfConsistency: 0,
        overall: 0,
      },
      selfConsistency: {
        passes: 3,
        agreementScore: 0,
        reviewFlags: [],
      },
      verificationSummary: {
        verified: 0,
        corrected: 0,
        unverified: 0,
      },
      offlineCapable: true,
      doctorReview: { status: 'pending' as const },
    },
  }));

  const finalMerged = await mergeSelfConsistency(seededPasses, scanContext?.ocrConfidence || 0);

  // FINALIZED INTEGRATION: Cross-reference with Offline Database
  if (finalMerged && finalMerged.medicines) {
    finalMerged.medicines = await Promise.all(finalMerged.medicines.map(async (medicine) => {
      // 1. Run the fuzzy match against our massive offline database
      const dbMatch = await verifyDrugName(medicine.name);
      
      // 2. If the fuzzy database match is unreliable (confidence < 70), keep the AI name
      if (dbMatch.status === 'unverified') {
        return {
          ...medicine,
          verification: {
            ...medicine.verification,
            status: 'unverified' as const,
            matchedName: medicine.name // Safety: keep extracted name
          }
        };
      }
      
      // 3. If confident match found, update the record
      return {
        ...medicine,
        verification: {
          ...medicine.verification,
          status: 'verified' as const,
          matchedName: dbMatch.matchedName
        }
      };
    }));

    // Update metadata summary stats
    if (finalMerged.metadata) {
      finalMerged.metadata.verificationSummary.unverified = finalMerged.medicines.filter(m => m.verification?.status === 'unverified').length;
      finalMerged.metadata.verificationSummary.verified = finalMerged.medicines.filter(m => m.verification?.status === 'verified').length;
    }
  }

  return finalMerged;
}

export async function translateResult(
  data: PrescriptionResult,
  targetLanguage: Extract<Lang, 'hi' | 'mr'>,
): Promise<PrescriptionResult> {
  const langName = targetLanguage === 'hi' ? 'Hindi' : 'Marathi';
  const prompt = `
Translate this prescription data into ${langName}.
Rules:
1. Never translate medicine names.
2. Keep JSON structure exactly the same.
3. Translate patient-facing and clinical text fields.
4. Return only JSON.

Data:
${JSON.stringify(data)}
`;

  const text = await callGemini(prompt);
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const translated = JSON.parse(clean) as PrescriptionResult;
    return finalizePrescription({
      ...translated,
      medicines: translated.medicines.map((medicine, index) => ({
        ...medicine,
        name: data.medicines[index]?.name ?? medicine.name,
      })),
      interactions: translated.interactions.map((interaction, index) => ({
        ...interaction,
        drugs: data.interactions[index]?.drugs ?? interaction.drugs,
      })),
      metadata: data.metadata,
      reviewFlags: data.reviewFlags,
    });
  } catch {
    throw new Error('Translation returned invalid JSON. Please try again.');
  }
}

export async function callMedicalChatbot(
  history: PrescriptionChatMessage[],
  currentMessage: string,
  prescriptionContext: PrescriptionResult,
  mode: ExplainMode = 'patient',
): Promise<string> {
  const response = await fetch('/api/medical-chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: currentMessage, history, prescription: prescriptionContext, mode }),
  });
  const body = await response.json().catch(() => ({})) as { answer?: string; error?: string };
  if (!response.ok || !body.answer) throw new Error(body.error || 'The medical assistant is unavailable.');
  return body.answer;
}
