import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ScanPage from './components/ScanPage';
import ProfilePage from './components/ProfilePage';
import ResultPage from './components/ResultPage';
import NearbyPharmacies from './components/NearbyPharmacies';
import AboutPage from './AboutPage';
import TermsModal from './components/TermsModal';
import DoctorVerificationPage from './components/DoctorVerificationPage';
import AuthPage from './components/AuthPage';
import ConsultDoctorPage from './components/ConsultDoctorPage';
import PrivacyPage from './components/PrivacyPage';
import { AuthProvider, RequireAuth } from './auth/AuthContext';
import { FamilyProfilesState, Lang, PrescriptionResult, UserProfile } from './types';
import {
  STORAGE_KEYS,
  loadFamilyProfiles,
  loadLastResult,
  saveFamilyProfiles,
  saveLastResult,
} from './utils/storage';

export default function App() {
  const [familyProfiles, setFamilyProfiles] = useState<FamilyProfilesState>(() => loadFamilyProfiles());
  const [lastResult, setLastResult] = useState<PrescriptionResult | null>(() => loadLastResult());
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(STORAGE_KEYS.lang) as Lang) || 'en');

  const activeProfile = useMemo<UserProfile>(() => {
    return (
      familyProfiles.profiles.find((profile) => profile.id === familyProfiles.activeProfileId) ||
      familyProfiles.profiles[0]
    );
  }, [familyProfiles]);

  useEffect(() => {
    saveFamilyProfiles(familyProfiles);
  }, [familyProfiles]);

  useEffect(() => {
    saveLastResult(lastResult);
  }, [lastResult]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.lang, lang);
  }, [lang]);

  const updateProfile = (profile: UserProfile) => {
    setFamilyProfiles((current) => ({
      ...current,
      profiles: current.profiles.map((item) => (item.id === profile.id ? profile : item)),
    }));
  };

  return (
    <AuthProvider>
      <TermsModal lang={lang} />
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 pb-12 font-sans text-slate-900">
          <Routes>
            <Route
              path="/"
              element={
                <ScanPage
                  onResult={setLastResult}
                  profile={activeProfile}
                  lang={lang}
                  onLangChange={setLang}
                />
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth><ProfilePage
                  familyProfiles={familyProfiles}
                  activeProfile={activeProfile}
                  onChange={setFamilyProfiles}
                  onUpdateProfile={updateProfile}
                  lang={lang}
                /></RequireAuth>
              }
            />
            <Route
              path="/result"
              element={
                lastResult ? (
                  <RequireAuth><ResultPage result={lastResult} profile={activeProfile} lang={lang} onResultUpdate={setLastResult} /></RequireAuth>
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route path="/pharmacies" element={<NearbyPharmacies lang={lang} />} />
            <Route path="/about" element={<AboutPage />} />
            <Route
              path="/verify"
              element={
                lastResult ? (
                  <RequireAuth><DoctorVerificationPage result={lastResult} profile={activeProfile} onUpdate={setLastResult} /></RequireAuth>
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route path="/auth" element={<AuthPage lang={lang} />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/consult" element={<RequireAuth><ConsultDoctorPage /></RequireAuth>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
