import { FamilyProfilesState, PrescriptionResult, ScanHistoryEntry, UserProfile } from '../types';

export const STORAGE_KEYS = {
  profiles: 'rxbridge_profiles_v2',
  profileLegacy: 'rxbridge_profile',
  lastResult: 'rxbridge_last_result',
  lang: 'rxbridge_lang',
  scanHistory: 'rxbridge_scan_history',
} as const;

export function createDefaultProfile(name = 'My Profile'): UserProfile {
  return {
    id: crypto.randomUUID(),
    name,
    relation: 'Self',
    allergies: [],
    isPregnant: false,
    isElderly: false,
    isChild: false,
    isAdult: true,
    memoryConsent: false,
    createdAt: new Date().toISOString(),
  };
}

export function loadFamilyProfiles(): FamilyProfilesState {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.profiles);
    if (stored) {
      const parsed = JSON.parse(stored) as FamilyProfilesState;
      if (parsed?.profiles?.length) {
        return parsed;
      }
    }
  } catch {
    // fall through to migration/default
  }

  try {
    const legacy = localStorage.getItem(STORAGE_KEYS.profileLegacy);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<UserProfile>;
      const migrated: UserProfile = {
        ...createDefaultProfile('My Profile'),
        ...parsed,
        id: parsed.id || crypto.randomUUID(),
        name: parsed.name || 'My Profile',
        relation: parsed.relation || 'Self',
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
      return {
        activeProfileId: migrated.id,
        profiles: [migrated],
      };
    }
  } catch {
    // ignore migration errors
  }

  const profile = createDefaultProfile();
  return {
    activeProfileId: profile.id,
    profiles: [profile],
  };
}

export function saveFamilyProfiles(state: FamilyProfilesState) {
  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(state));
}

export function loadLastResult(): PrescriptionResult | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lastResult);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function saveLastResult(result: PrescriptionResult | null) {
  if (!result) {
    localStorage.removeItem(STORAGE_KEYS.lastResult);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.lastResult, JSON.stringify(result));
}

export function loadScanHistory(): ScanHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.scanHistory) || '[]');
  } catch {
    return [];
  }
}

export function saveScanHistory(history: ScanHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEYS.scanHistory, JSON.stringify(history));
}

export function saveResultToHistory(result: PrescriptionResult) {
  const existing = loadScanHistory();
  if (existing.length > 0 && JSON.stringify(existing[0].fullResult) === JSON.stringify(result)) {
    return;
  }

  const entry: ScanHistoryEntry = {
    id: crypto.randomUUID(),
    date: new Date(result.metadata?.scannedAt || Date.now()).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    medicineCount: result.medicines.length,
    interactionCount: result.interactions.length,
    medicines: result.medicines.slice(0, 3).map((med) => med.name),
    profileId: result.metadata?.profileId,
    profileName: result.metadata?.profileName,
    trustScore: result.metadata?.trustScore,
    fullResult: result,
  };

  saveScanHistory([entry, ...existing].slice(0, 25));
}
