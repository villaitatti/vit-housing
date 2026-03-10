import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LanguageSwitchProps = {
  className?: string;
  buttonClassName?: string;
  size?: 'default' | 'sm' | 'lg';
};

function LanguageFlag({ lang }: { lang: 'en' | 'it' }) {
  if (lang === 'it') {
    return (
      <span
        aria-hidden
        className="h-3.5 w-5 rounded-[2px] border border-black/15 bg-[linear-gradient(to_right,#009246_33.33%,#ffffff_33.33%,#ffffff_66.66%,#ce2b37_66.66%)]"
      />
    );
  }

  return (
    <span aria-hidden className="relative h-3.5 w-5 overflow-hidden rounded-[2px] border border-black/15">
      <span className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,#b22234_0_7.69%,#ffffff_7.69%_15.38%)]" />
      <span className="absolute left-0 top-0 h-[53.85%] w-2/5 bg-[#3c3b6e]" />
    </span>
  );
}

export function LanguageSwitch({
  className,
  buttonClassName,
  size = 'sm',
}: LanguageSwitchProps) {
  const { lang } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const currentLang: 'en' | 'it' = lang === 'it' ? 'it' : 'en';
  const otherLang: 'en' | 'it' = currentLang === 'en' ? 'it' : 'en';

  const handleLanguageSwitch = () => {
    const segments = location.pathname.split('/');
    segments[1] = otherLang;
    const nextPath = segments.join('/') || `/${otherLang}`;

    navigate(`${nextPath}${location.search}${location.hash}`);
  };

  return (
    <div className={cn('flex items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={handleLanguageSwitch}
        aria-label={`${t('nav.language')}: ${otherLang.toUpperCase()}`}
        className={cn('gap-1.5', buttonClassName)}
      >
        <LanguageFlag lang={otherLang} />
        <span className="font-semibold">{otherLang.toUpperCase()}</span>
      </Button>
    </div>
  );
}
