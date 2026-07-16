export type VerificationStatus = 'verified' | 'corrected' | 'unverified';
export type ExplainMode = 'patient' | 'clinical';
export type ReviewSeverity = 'high' | 'medium' | 'low';
export type InteractionSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface MedicineSlots {
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
  night: boolean;
}

export interface DrugVerification {
  queriedName: string;
  matchedName: string | null;
  genericName?: string;
  confidence: number;
  status: VerificationStatus;
  source: 'local-drug-db';
  notes?: string;
}

export interface ExtractionConfidence {
  overall: number;
  ocr: number;
  nameMatch: number;
  consensus: number;
  requiresReview: boolean;
  reasons: string[];
}

export interface RefillInfo {
  startDate: string;
  dailyDoseCount: number;
  estimatedDaysSupply: number | null;
  daysRemaining: number | null;
  refillAlert: boolean;
  source: 'duration' | 'quantity' | 'default';
}

export interface Medicine {
  id?: string;
  name: string;
  dosage: string;
  timing: string;
  slots: MedicineSlots;
  purpose: string;
  purposeClinical?: string;
  foodWarning?: string;
  usageAlert?: string;
  usageAlertClinical?: string;
  caution?: string;
  cautionClinical?: string;
  quantityPrescribed?: number | null;
  durationDays?: number | null;
  verification?: DrugVerification;
  confidence?: ExtractionConfidence;
  refill?: RefillInfo;
  reviewRequired?: boolean;
}

export interface Tabs {
  medicationList: {
    name: string;
    dosage: string;
    frequency: string;
  }[];
  criticalSafetyAlerts: string[];
  usageAlerts: string[];
  warningsAndCautions: string[];
  actionableItems: {
    findPharmacyText: string;
    shareCaregiverText: string;
  };
}

export interface Interaction {
  severity: InteractionSeverity;
  drugs: string[];
  description: string;
  descriptionClinical?: string;
}

export interface ReviewFlag {
  field: string;
  medicineName?: string;
  message: string;
  severity: ReviewSeverity;
  suggestedValue?: string;
  values?: string[];
}

export interface PrescriptionChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface PrescriptionMetadata {
  scannedAt: string;
  profileId?: string;
  profileName?: string;
  ocrText?: string;
  ocrConfidence?: number;
  trustScore: number;
  trustBreakdown: {
    ocrClarity: number;
    nameMatch: number;
    selfConsistency: number;
    overall: number;
  };
  selfConsistency: {
    passes: number;
    agreementScore: number;
    reviewFlags: ReviewFlag[];
  };
  verificationSummary: {
    verified: number;
    corrected: number;
    unverified: number;
  };
  supplySummary?: {
    nextRefillInDays: number | null;
    medicinesRunningLow: string[];
  };
  offlineCapable: boolean;
  explainMode?: ExplainMode;
  doctorReview?: {
    status: 'pending' | 'verified' | 'corrected';
    reviewerName?: string;
    verifiedAt?: string;
    notes?: string;
  };
}

export interface PrescriptionResult {
  rescanRequired?: boolean;
  medicines: Medicine[];
  interactions: Interaction[];
  generalWarnings: string[];
  usageAlerts: string[];
  warningsAndCautions: string[];
  tabs?: Tabs;
  metadata?: PrescriptionMetadata;
  reviewFlags?: ReviewFlag[];
  chatHistory?: PrescriptionChatMessage[];
}

export type Lang = 'en' | 'hi' | 'mr';

export interface UserProfile {
  id: string;
  name: string;
  relation?: string;
  allergies: string[];
  isPregnant: boolean;
  isElderly: boolean;
  isChild: boolean;
  isAdult: boolean;
  memoryConsent?: boolean;
  createdAt: string;
}

export interface FamilyProfilesState {
  activeProfileId: string;
  profiles: UserProfile[];
}

export interface ScanHistoryEntry {
  id: string;
  date: string;
  medicineCount: number;
  interactionCount: number;
  medicines: string[];
  profileId?: string;
  profileName?: string;
  trustScore?: number;
  fullResult?: PrescriptionResult;
}
