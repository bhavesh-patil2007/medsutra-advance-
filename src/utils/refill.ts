import { Medicine, PrescriptionResult } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SUPPLY_DAYS = 30;

export function getDailyDoseCount(medicine: Medicine): number {
  const slotCount = Object.values(medicine.slots || {}).filter(Boolean).length;
  if (slotCount > 0) return slotCount;

  const timing = medicine.timing.toLowerCase();
  if (timing.includes('three times') || timing.includes('tds')) return 3;
  if (timing.includes('twice') || timing.includes('bd') || timing.includes('bid')) return 2;
  if (timing.includes('four times') || timing.includes('qid')) return 4;
  return 1;
}

function resolveSupplyDays(medicine: Medicine, dailyDoseCount: number) {
  if (medicine.durationDays && medicine.durationDays > 0) {
    return { days: medicine.durationDays, source: 'duration' as const };
  }

  if (medicine.quantityPrescribed && medicine.quantityPrescribed > 0) {
    return {
      days: Math.max(1, Math.round(medicine.quantityPrescribed / Math.max(1, dailyDoseCount))),
      source: 'quantity' as const,
    };
  }

  return { days: DEFAULT_SUPPLY_DAYS, source: 'default' as const };
}

export function attachRefillInfo(result: PrescriptionResult): PrescriptionResult {
  const startDate = result.metadata?.scannedAt || new Date().toISOString();
  const today = new Date();

  const medicines = result.medicines.map((medicine) => {
    const dailyDoseCount = getDailyDoseCount(medicine);
    const supply = resolveSupplyDays(medicine, dailyDoseCount);
    const elapsedDays = Math.max(0, Math.floor((today.getTime() - new Date(startDate).getTime()) / MS_PER_DAY));
    const daysRemaining = Math.max(0, supply.days - elapsedDays);

    return {
      ...medicine,
      refill: {
        startDate,
        dailyDoseCount,
        estimatedDaysSupply: supply.days,
        daysRemaining,
        refillAlert: daysRemaining <= 3,
        source: supply.source,
      },
    };
  });

  const runningLow = medicines
    .filter((medicine) => (medicine.refill?.daysRemaining ?? 99) <= 3)
    .map((medicine) => medicine.name);

  const nextRefillInDays = medicines.reduce<number | null>((min, medicine) => {
    const remaining = medicine.refill?.daysRemaining;
    if (remaining == null) return min;
    if (min == null) return remaining;
    return Math.min(min, remaining);
  }, null);

  return {
    ...result,
    medicines,
    metadata: {
      ...result.metadata,
      scannedAt: startDate,
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
      verificationSummary: result.metadata?.verificationSummary || {
        verified: 0,
        corrected: 0,
        unverified: 0,
      },
      offlineCapable: true,
      supplySummary: {
        nextRefillInDays,
        medicinesRunningLow: runningLow,
      },
      doctorReview: result.metadata?.doctorReview || { status: 'pending' },
    },
  };
}
