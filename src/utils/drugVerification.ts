import { DRUG_DATABASE } from '../data/drugDatabase';
import { DrugVerification, Medicine, PrescriptionResult, VerificationStatus } from '../types';

function normalizeDrugName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s?(mg|mcg|g|ml)\b/g, ' ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

export function verifyMedicineName(name: string): DrugVerification {
  const normalized = normalizeDrugName(name);
  let best:
    | {
        matchedName: string;
        genericName: string;
        score: number;
      }
    | undefined;

  for (const record of DRUG_DATABASE) {
    const candidates = [record.canonicalName, record.genericName, ...record.aliases, ...record.brandNames];
    for (const candidate of candidates) {
      const score = similarityScore(normalized, normalizeDrugName(candidate));
      if (!best || score > best.score) {
        best = {
          matchedName: record.canonicalName,
          genericName: record.genericName,
          score,
        };
      }
    }
  }

  let status: VerificationStatus = 'unverified';
  let notes = 'No close drug database match was found.';
  if (best && best.score >= 0.93) {
    status = 'verified';
    notes = 'Strong database match found.';
  } else if (best && best.score >= 0.78) {
    status = 'corrected';
    notes = 'Likely OCR typo corrected using fuzzy match.';
  }

  return {
    queriedName: name,
    matchedName: best?.matchedName ?? null,
    genericName: best?.genericName,
    confidence: Math.round((best?.score ?? 0) * 100),
    status,
    source: 'local-drug-db',
    notes,
  };
}

export function applyDrugGrounding(result: PrescriptionResult): PrescriptionResult {
  const medicines = result.medicines.map((medicine) => {
    const verification = verifyMedicineName(medicine.name);
    return {
      ...medicine,
      verification,
      name:
        verification.status === 'corrected' && verification.matchedName
          ? `${verification.matchedName} (OCR corrected)`
          : medicine.name,
      reviewRequired: verification.status === 'unverified' || medicine.reviewRequired,
    } satisfies Medicine;
  });

  const verificationSummary = medicines.reduce(
    (summary, med) => {
      const status = med.verification?.status;
      if (status === 'verified') summary.verified += 1;
      else if (status === 'corrected') summary.corrected += 1;
      else summary.unverified += 1;
      return summary;
    },
    { verified: 0, corrected: 0, unverified: 0 },
  );

  return {
    ...result,
    medicines,
    metadata: {
      ...result.metadata,
      scannedAt: result.metadata?.scannedAt || new Date().toISOString(),
      trustScore: result.metadata?.trustScore || 0,
      trustBreakdown: result.metadata?.trustBreakdown || {
        ocrClarity: 0,
        nameMatch: 0,
        selfConsistency: 0,
        overall: 0,
      },
      selfConsistency: result.metadata?.selfConsistency || {
        passes: 1,
        agreementScore: 0,
        reviewFlags: [],
      },
      offlineCapable: true,
      verificationSummary,
      doctorReview: result.metadata?.doctorReview || { status: 'pending' },
    },
  };
}
