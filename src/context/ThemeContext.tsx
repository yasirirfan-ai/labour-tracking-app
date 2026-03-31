import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

type Theme = 'light' | 'dark';
type Language = 'en' | 'es';

interface ThemeContextType {
  adminTheme: Theme;
  workerTheme: Theme;
  adminLang: Language;
  workerLang: Language;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
  currentTheme: Theme;
  currentLang: Language;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminTheme, setAdminTheme] = useState<Theme>(() => {
    return (localStorage.getItem('admin_theme') as Theme) || 'light';
  });
  const [workerTheme, setWorkerTheme] = useState<Theme>(() => {
    return (localStorage.getItem('worker_theme') as Theme) || (localStorage.getItem('theme') as Theme) || 'light';
  });

  const [adminLang, setAdminLang] = useState<Language>(() => {
    return (localStorage.getItem('admin_lang') as Language) || 'en';
  });
  const [workerLang, setWorkerLang] = useState<Language>(() => {
    return (localStorage.getItem('worker_lang') as Language) || (localStorage.getItem('i18nextLng') as Language) || 'en';
  });

  const [currentPortal, setCurrentPortal] = useState<'admin' | 'worker'>('admin');

  useEffect(() => {
    const updatePortal = () => {
      const path = window.location.pathname;
      const portal = path.includes('/worker-portal') ? 'worker' : 'admin';
      setCurrentPortal(portal);
    };

    updatePortal();
    
    // Using a MutationObserver to watch for path changes in SPAs like react-router
    let lastPath = window.location.pathname;
    const observer = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        updatePortal();
      }
    });

    observer.observe(document, { subtree: true, childList: true });
    window.addEventListener('popstate', updatePortal);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', updatePortal);
    };
  }, []);

  const currentTheme = currentPortal === 'worker' ? workerTheme : adminTheme;
  const currentLang = currentPortal === 'worker' ? workerLang : adminLang;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-portal', currentPortal);
  }, [currentPortal]);

  useEffect(() => {
    if (i18n.language !== currentLang) {
      i18n.changeLanguage(currentLang);
    }
  }, [currentLang]);

  const toggleTheme = () => {
    if (currentPortal === 'worker') {
      const newTheme = workerTheme === 'light' ? 'dark' : 'light';
      setWorkerTheme(newTheme);
      localStorage.setItem('worker_theme', newTheme);
    } else {
      const newTheme = adminTheme === 'light' ? 'dark' : 'light';
      setAdminTheme(newTheme);
      localStorage.setItem('admin_theme', newTheme);
    }
  };

  const setLanguage = (lang: Language) => {
    if (currentPortal === 'worker') {
      setWorkerLang(lang);
      localStorage.setItem('worker_lang', lang);
    } else {
      setAdminLang(lang);
      localStorage.setItem('admin_lang', lang);
    }
  };

  return (
    <ThemeContext.Provider value={{ 
      adminTheme, 
      workerTheme, 
      adminLang, 
      workerLang, 
      toggleTheme, 
      setLanguage,
      currentTheme,
      currentLang
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
