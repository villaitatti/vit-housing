import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
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
        aria-hidden="true"
        className="h-3.5 w-5 rounded-[2px] border border-black/15 bg-[linear-gradient(to_right,#009246_33.33%,#ffffff_33.33%,#ffffff_66.66%,#ce2b37_66.66%)]"
      />
    );
  }

  return (
    <span aria-hidden="true" className="relative h-3.5 w-5 overflow-hidden rounded-[2px] border border-black/15">
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
  const [open, setOpen] = useState(false);

  const currentLang: 'en' | 'it' = lang === 'it' ? 'it' : 'en';
  const otherLang: 'en' | 'it' = currentLang === 'en' ? 'it' : 'en';
  const hoverLabel = currentLang === 'en' ? t('nav.switchToItalian') : t('nav.switchToEnglish');

  const handleLanguageSwitch = () => {
    const segments = location.pathname.split('/');
    segments[1] = otherLang;
    const nextPath = segments.join('/') || `/${otherLang}`;

    navigate(`${nextPath}${location.search}${location.hash}`);
  };

  return (
    <div className={cn('flex items-center', className)}>
      <Popover open={open}>
        <PopoverAnchor asChild>
          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          >
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
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={10}
          className="relative w-auto rounded-[1.15rem] border-0 bg-foreground px-4 py-2 text-sm font-medium text-background shadow-xl before:absolute before:right-5 before:top-0 before:h-3 before:w-3 before:-translate-y-1/2 before:rotate-45 before:bg-foreground"
        >
          <span className="whitespace-nowrap">{hoverLabel}</span>
        </PopoverContent>
      </Popover>
    </div>
  );
}
