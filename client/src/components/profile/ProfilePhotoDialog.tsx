import { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ProfilePhotoDialogProps {
  file: File | null;
  open: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function cropImage(imageSrc: string, cropArea: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to prepare image crop');
  }

  context.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('Failed to export cropped image'));
      },
      'image/jpeg',
      0.95,
    );
  });
}

export function ProfilePhotoDialog({
  file,
  open,
  isSubmitting,
  onCancel,
  onConfirm,
}: ProfilePhotoDialogProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isAllowedFile = !file || ALLOWED_TYPES.includes(file.type);

  const handleCancel = () => {
    if (isSubmitting) {
      return;
    }

    onCancel();
  };

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }

    const nextImageUrl = URL.createObjectURL(file);
    setImageUrl(nextImageUrl);

    return () => {
      URL.revokeObjectURL(nextImageUrl);
    };
  }, [file]);

  const handleConfirm = async () => {
    if (!imageUrl || !croppedAreaPixels) {
      return;
    }

    const blob = await cropImage(imageUrl, croppedAreaPixels);
    await onConfirm(blob);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleCancel();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('profile.photo.cropTitle')}</DialogTitle>
        </DialogHeader>

        {!isAllowedFile ? (
          <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {t('profile.photo.invalidType')}
          </div>
        ) : imageUrl ? (
          <div className="space-y-4">
            <div className="relative h-[360px] overflow-hidden rounded-[2rem] bg-muted">
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="profile-photo-zoom">
                {t('profile.photo.zoom')}
              </label>
              <input
                id="profile-photo-zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-full"
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={!imageUrl || !isAllowedFile || isSubmitting}>
            {isSubmitting ? t('common.loading') : t('profile.photo.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
