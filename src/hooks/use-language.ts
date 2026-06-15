'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lang, Translations, getTranslation } from '@/lib/i18n';

const STORAGE_KEY = 'moodchat_lang';

export function useLanguage() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'ar' || stored === 'en') return stored;
    }
    return 'ar'; // default Arabic
  });

  const t: Translations = getTranslation(lang);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    // Update document direction and lang
    document.documentElement.dir = t.dir;
    document.documentElement.lang = lang;
  }, [lang, t.dir]);

  const toggleLang = useCallback(() => {
    setLang(prev => prev === 'ar' ? 'en' : 'ar');
  }, []);

  const setLanguage = useCallback((newLang: Lang) => {
    setLang(newLang);
  }, []);

  return { lang, t, toggleLang, setLanguage };
}
