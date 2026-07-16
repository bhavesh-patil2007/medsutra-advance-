// @ts-nocheck
import Fuse from 'fuse.js';

interface DrugEntry {
  brand: string;
  generic: string;
}

let fuseIndex: Fuse<DrugEntry> | null = null;
let isInitializing = false;

// Initialize the database asynchronously
export async function initDrugDatabase() {
  if (fuseIndex || isInitializing) return;
  isInitializing = true;

  try {
    const response = await fetch('/indian_drugs.json');
    const data: DrugEntry[] = await response.json();

    fuseIndex = new Fuse(data, {
      keys: ['brand', 'generic'],
      threshold: 0.3, // Strictness level
      distance: 100, 
      includeScore: true,
    });
    
    console.log('Med Sutra AI: Offline drug database loaded successfully!');
  } catch (error) {
    console.error('Failed to load drug database:', error);
  } finally {
    isInitializing = false;
  }
}

// The search function to use on extracted medicines
export async function verifyDrugName(extractedName: string) {
  if (!fuseIndex) {
    await initDrugDatabase();
  }

  if (!fuseIndex) {
    return { matchedName: null, confidence: 0, status: 'unverified' as const };
  }

  const results = fuseIndex.search(extractedName);

  if (results.length > 0 && results[0].score !== undefined) {
    const confidenceScore = Math.round((1 - results[0].score) * 100);

    if (confidenceScore >= 70) {
      return {
        matchedName: results[0].item.brand,
        genericName: results[0].item.generic,
        confidence: confidenceScore,
        status: 'verified' as const,
      };
    }
  }

  return {
    matchedName: extractedName,
    confidence: 0,
    status: 'unverified' as const,
  };
}