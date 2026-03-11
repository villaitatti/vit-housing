import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type FavoriteDialogMode = 'add' | 'edit' | 'remove';

interface FavoriteListingDialogProps {
  open: boolean;
  mode: FavoriteDialogMode;
  listingTitle: string;
  initialNote?: string | null;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void> | void;
}

export function FavoriteListingDialog({
  open,
  mode,
  listingTitle,
  initialNote,
  isPending = false,
  onClose,
  onConfirm,
}: FavoriteListingDialogProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initialNote || '');

  const title = mode === 'add'
    ? t('favorites.addDialogTitle')
    : mode === 'edit'
      ? t('favorites.editDialogTitle')
      : t('favorites.removeDialogTitle');

  const description = mode === 'add'
    ? t('favorites.addDialogDescription', { title: listingTitle })
    : mode === 'edit'
      ? t('favorites.editDialogDescription', { title: listingTitle })
      : t('favorites.removeDialogDescription', { title: listingTitle });

  const confirmLabel = mode === 'add'
    ? t('favorites.confirmAdd')
    : mode === 'edit'
      ? t('favorites.confirmEdit')
      : t('favorites.confirmRemove');

  const handleConfirm = async () => {
    try {
      await onConfirm(note);
    } catch {
      // Keep the dialog open so the user can correct the action or retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode !== 'remove' ? (
          <div className="space-y-2">
            <Label htmlFor="favorite-note">{t('favorites.noteLabel')}</Label>
            <Textarea
              id="favorite-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder={t('favorites.notePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('favorites.noteHint')}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={mode === 'remove' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
