import { applyDrugGrounding } from './drugVerification';
import { attachRefillInfo } from './refill';
import { ExtractionConfidence, Medicine, PrescriptionResult, ReviewFlag } from '../types';

function normalize(value: string) {
  return value.toLowerCase().replace(/\(ocr corrected\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function agreementRatio(values: string[]) {
  if (values.length <= 1) return 1;
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const best = Math.max(...counts.values());
  return best / values.length;
}

export function mergeSelfConsistency(
  passes: PrescriptionResult[],
  ocrConfidence: number,
): PrescriptionResult {
  const primary = passes[0];
  const reviewFlags: ReviewFlag[] = [];

  const medicines = primary.medicines.map((medicine, index) => {
    const nameValues = passes.map((pass) => normalize(pass.medicines[index]?.name || medicine.name));
    const dosageValues = passes.map((pass) => normalize(pass.medicines[index]?.dosage || medicine.dosage));
    const timingValues = passes.map((pass) => normalize(pass.medicines[index]?.timing || medicine.timing));
    const nameAgreement = agreementRatio(nameValues);
    const dosageAgreement = agreementRatio(dosageValues);
    const timingAgreement = agreementRatio(timingValues);
    const consensus = Math.round(((nameAgreement + dosageAgreement + timingAgreement) / 3) * 100);

    const confidence: ExtractionConfidence = {
      overall: Math.round((ocrConfidence + consensus) / 2),
      ocr: ocrConfidence,
      nameMatch: 0,
      consensus,
      requiresReview: consensus < 80,
      reasons: consensus < 80 ? ['Multi-pass extraction disagreed on this medicine.'] : ['Multi-pass extraction agreed on this medicine.'],
    };

    return {
      ...medicine,
      confidence,
      reviewRequired: confidence.requiresReview,
    } satisfies Medicine;
  });

  const agreementScore = average(medicines.map((medicine) => medicine.confidence?.consensus || 0));

  const merged: PrescriptionResult = {
    ...primary,
    medicines,
    reviewFlags,
    metadata: {
      scannedAt: new Date().toISOString(),
      ocrConfidence,
      ocrText: primary.metadata?.ocrText,
      profileId: primary.metadata?.profileId,
      profileName: primary.metadata?.profileName,
      trustScore: 0,
      trustBreakdown: {
        ocrClarity: ocrConfidence,
        nameMatch: 0,
        selfConsistency: agreementScore,
        overall: 0,
      },
      selfConsistency: {
        passes: passes.length,
        agreementScore,
        reviewFlags,
      },
      verificationSummary: {
        verified: 0,
        corrected: 0,
        unverified: 0,
      },
      offlineCapable: true,
      doctorReview: { status: 'pending' },
    },
  };

  return finalizePrescription(merged);
}

export function finalizePrescription(result: PrescriptionResult): PrescriptionResult {
  const grounded = applyDrugGrounding(result);
  const withRefill = attachRefillInfo(grounded);

  const nameMatch = average(withRefill.medicines.map((medicine) => medicine.verification?.confidence || 0));
  const selfConsistency = withRefill.metadata?.selfConsistency.agreementScore || average(withRefill.medicines.map((medicine) => medicine.confidence?.consensus || 100));
  const ocrClarity = withRefill.metadata?.ocrConfidence || average(withRefill.medicines.map((medicine) => medicine.confidence?.ocr || 0));
  const overall = Math.round(ocrClarity * 0.35 + nameMatch * 0.35 + selfConsistency * 0.3);

  const medicines = withRefill.medicines.map((medicine) => ({
    ...medicine,
    confidence: {
      overall: Math.round((medicine.confidence?.consensus || selfConsistency) * 0.4 + (medicine.verification?.confidence || nameMatch) * 0.35 + ocrClarity * 0.25),
      ocr: medicine.confidence?.ocr || ocrClarity,
      nameMatch: medicine.verification?.confidence || nameMatch,
      consensus: medicine.confidence?.consensus || selfConsistency,
      requiresReview: medicine.reviewRequired || medicine.verification?.status === 'unverified',
      reasons: [
        medicine.verification?.notes || 'Drug grounding complete.',
        medicine.confidence?.requiresReview ? 'Multi-pass disagreement detected.' : 'Multi-pass agreement is acceptable.',
      ],
    },
  }));

  return {
    ...withRefill,
    medicines,
    metadata: {
      ...withRefill.metadata!,
      trustScore: overall,
      trustBreakdown: {
        ocrClarity,
        nameMatch,
        selfConsistency,
        overall,
      },
      verificationSummary: {
        verified: medicines.filter((medicine) => medicine.verification?.status === 'verified').length,
        corrected: medicines.filter((medicine) => medicine.verification?.status === 'corrected').length,
        unverified: medicines.filter((medicine) => medicine.verification?.status === 'unverified').length,
      },
    },
  };
}