import { Outlet, useParams } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function AppLayout() {
  const { lang } = useParams();
  const { i18n } = useTranslation();
  const routeLang = lang === 'it' ? 'it' : 'en';

  useLayoutEffect(() => {
    if (i18n.resolvedLanguage !== routeLang) {
      void i18n.changeLanguage(routeLang);
    }
  }, [i18n, routeLang]);

  return <Outlet />;
}
