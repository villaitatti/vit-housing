import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-secondary/45">
      <div className="container mx-auto space-y-3 px-4 py-6 text-center text-sm text-muted-foreground">
        <p className="leading-relaxed">{t('footer.disclaimer')}</p>
        <p className="font-medium text-foreground">{t('footer.copyright')}</p>
        <p>{t('footer.addressLine')}</p>
      </div>
    </footer>
  );
}
