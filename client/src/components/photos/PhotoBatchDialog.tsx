import { useState, useCallback, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { XIcon, AlertTriangle, Check } from 'lucide-react';

interface PhotoBatchDialogProps {
  open: boolean;
  files: File[];
  onComplete: (croppedBlobs: Blob[]) => void;
  onCancel: () => void;
}

type ImageStatus = 'pending' | 'valid' | 'invalid' | 'cropped';

interface BatchImage {
  file: File;
  objectUrl: string;
  status: ImageStatus;
  error?: string;
  croppedBlob?: Blob;
  croppedPreview?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIN_FILE_SIZE = 50 * 1024;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

function validateImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

async function getCroppedImg(imageSrc: string, crop: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/jpeg',
      0.95,
    );
  });
}

export function PhotoBatchDialog({ open, files, onComplete, onCancel }: PhotoBatchDialogProps) {
  const { t } = useTranslation();
  const [images, setImages] = useState<BatchImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showUnsavedCropConfirm, setShowUnsavedCropConfirm] = useState(false);
  const [pendingNavigateIndex, setPendingNavigateIndex] = useState<number | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const initializedRef = useRef(false);
  const imagesRef = useRef<BatchImage[]>([]);
  const validationBatchRef = useRef(0);
  const cropDirtyRef = useRef(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Initialize batch images and run validation
  useEffect(() => {
    if (!open || files.length === 0) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    const batch: BatchImage[] = files.map((file) => ({
      file,
      objectUrl: URL.createObjectURL(file),
      status: 'pending' as ImageStatus,
    }));

    const batchToken = ++validationBatchRef.current;

    setImages(batch);
    setActiveIndex(0);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsReviewMode(false);

    // Validate each file async
    batch.forEach((img, index) => {
      validateFile(img.file, index);
    });

    async function validateFile(file: File, index: number) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        updateImageStatus(index, 'invalid', t('listingForm.photos.invalidType'));
        return;
      }
      if (file.size < MIN_FILE_SIZE) {
        updateImageStatus(index, 'invalid', t('listingForm.photos.fileTooSmall'));
        return;
      }
      try {
        const dims = await validateImageDimensions(file);
        if (validationBatchRef.current !== batchToken) return;
        if (dims.width < MIN_WIDTH || dims.height < MIN_HEIGHT) {
          updateImageStatus(index, 'invalid', t('listingForm.photos.dimensionsTooSmall'));
          return;
        }
        updateImageStatus(index, 'valid');
      } catch {
        if (validationBatchRef.current !== batchToken) return;
        updateImageStatus(index, 'invalid', t('listingForm.photos.invalidType'));
      }
    }

    function updateImageStatus(index: number, status: ImageStatus, error?: string) {
      if (validationBatchRef.current !== batchToken) return;
      setImages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status, error };
        return next;
      });
    }

    return () => {
      imagesRef.current.forEach((img) => {
        URL.revokeObjectURL(img.objectUrl);
        if (img.croppedPreview) URL.revokeObjectURL(img.croppedPreview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files]);

  const activeImage = images[activeIndex];

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    // Mark dirty only after the initial onCropComplete from cropper mount
    if (croppedAreaPixels !== null) {
      cropDirtyRef.current = true;
    }
    setCroppedAreaPixels(croppedPixels);
  }, [croppedAreaPixels]);

  const resetCropState = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    cropDirtyRef.current = false;
  };

  const isLastImage = activeIndex === images.length - 1;

  const allProcessed = images.length > 0 && images.every(
    (img) => img.status === 'cropped' || img.status === 'invalid',
  );

  const advanceToNext = () => {
    if (isLastImage) {
      setIsReviewMode(true);
    } else {
      setActiveIndex(activeIndex + 1);
      resetCropState();
    }
  };

  const handleSaveCrop = async () => {
    if (!croppedAreaPixels || !activeImage) return;
    try {
      const blob = await getCroppedImg(activeImage.objectUrl, croppedAreaPixels);
      const preview = URL.createObjectURL(blob);

      setImages((prev) => {
        const next = [...prev];
        if (next[activeIndex].croppedPreview) {
          URL.revokeObjectURL(next[activeIndex].croppedPreview!);
        }
        next[activeIndex] = {
          ...next[activeIndex],
          status: 'cropped',
          croppedBlob: blob,
          croppedPreview: preview,
        };
        return next;
      });

      advanceToNext();
    } catch {
      setImages((prev) => {
        const next = [...prev];
        next[activeIndex] = {
          ...next[activeIndex],
          status: 'invalid',
          error: t('listingForm.photos.invalidType'),
        };
        return next;
      });
    }
  };

  const handleSkipNext = () => {
    advanceToNext();
  };

  const handleDone = () => {
    const blobs = images
      .filter((img) => img.status === 'cropped' && img.croppedBlob)
      .map((img) => img.croppedBlob!);
    onComplete(blobs);
  };

  const navigateToIndex = (index: number) => {
    setActiveIndex(index);
    resetCropState();
  };

  const handleThumbnailClick = (index: number) => {
    if (index === activeIndex) return;

    // Prompt if user has interacted with the cropper on a valid or cropped image
    const hasUnsavedCrop = (activeImage?.status === 'valid' || activeImage?.status === 'cropped')
      && cropDirtyRef.current && croppedAreaPixels;
    if (hasUnsavedCrop) {
      setPendingNavigateIndex(index);
      setShowUnsavedCropConfirm(true);
      return;
    }

    // All other cases — navigate freely
    navigateToIndex(index);
  };

  const handleSaveAndNavigate = async () => {
    if (croppedAreaPixels && activeImage) {
      try {
        const blob = await getCroppedImg(activeImage.objectUrl, croppedAreaPixels);
        const preview = URL.createObjectURL(blob);
        setImages((prev) => {
          const next = [...prev];
          if (next[activeIndex].croppedPreview) {
            URL.revokeObjectURL(next[activeIndex].croppedPreview!);
          }
          next[activeIndex] = {
            ...next[activeIndex],
            status: 'cropped',
            croppedBlob: blob,
            croppedPreview: preview,
          };
          return next;
        });
      } catch {
        setImages((prev) => {
          const next = [...prev];
          next[activeIndex] = {
            ...next[activeIndex],
            status: 'invalid',
            error: t('listingForm.photos.invalidType'),
          };
          return next;
        });
      }
    }
    setShowUnsavedCropConfirm(false);
    if (pendingNavigateIndex !== null) {
      navigateToIndex(pendingNavigateIndex);
      setPendingNavigateIndex(null);
    }
  };

  const handleStay = () => {
    setShowUnsavedCropConfirm(false);
    setPendingNavigateIndex(null);
  };

  const handleRequestClose = () => {
    setShowCloseConfirm(true);
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    // Cleanup
    images.forEach((img) => {
      URL.revokeObjectURL(img.objectUrl);
      if (img.croppedPreview) URL.revokeObjectURL(img.croppedPreview);
    });
    onCancel();
  };

  const isCurrentValid = activeImage?.status === 'valid';
  const isCurrentCropped = activeImage?.status === 'cropped';
  const isCurrentInvalid = activeImage?.status === 'invalid';

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-5xl max-h-[90vh] overflow-y-auto"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleRequestClose();
          }}
        >
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>
              {t('listingForm.photos.imageCount', {
                current: activeIndex + 1,
                total: images.length,
              })}
            </DialogTitle>
            <button
              type="button"
              onClick={handleRequestClose}
              className="rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </button>
          </DialogHeader>

          {/* Crop area / Error display */}
          <div className="relative w-full h-[28rem] bg-muted rounded-lg overflow-hidden">
            {activeImage?.status === 'pending' && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">{t('common.loading')}</p>
              </div>
            )}
            {isCurrentInvalid && (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <p className="text-sm text-destructive text-center font-medium">
                  {activeImage.error}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-full">
                  {activeImage.file.name}
                </p>
              </div>
            )}
            {(isCurrentValid || isCurrentCropped) && (
              <Cropper
                image={activeImage.objectUrl}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          {/* Zoom slider */}
          {(isCurrentValid || isCurrentCropped) && (
            <div className="flex items-center gap-3 px-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {t('listingForm.photos.zoom')}
              </span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto py-2">
              {images.map((img, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleThumbnailClick(index)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                    index === activeIndex
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground/50'
                  }`}
                >
                  <img
                    src={img.croppedPreview || img.objectUrl}
                    alt={img.file.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Status indicator */}
                  {img.status === 'cropped' && (
                    <span className="absolute bottom-0.5 right-0.5 bg-green-600 rounded-full p-0.5">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  {img.status === 'invalid' && (
                    <span className="absolute bottom-0.5 right-0.5 bg-destructive rounded-full p-0.5">
                      <AlertTriangle className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <DialogFooter>
            {isReviewMode || allProcessed ? (
              <Button onClick={handleDone}>
                {t('listingForm.photos.done')}
              </Button>
            ) : (
              <>
                {isCurrentInvalid && (
                  <Button variant="outline" onClick={handleSkipNext}>
                    {isLastImage
                      ? t('listingForm.photos.done')
                      : t('listingForm.photos.skipNext')}
                  </Button>
                )}
                {isCurrentCropped && (
                  <Button onClick={handleSaveCrop}>
                    {isLastImage
                      ? t('listingForm.photos.saveDone')
                      : t('listingForm.photos.saveNext')}
                  </Button>
                )}
                {isCurrentValid && (
                  <Button onClick={handleSaveCrop}>
                    {isLastImage
                      ? t('listingForm.photos.saveDone')
                      : t('listingForm.photos.saveNext')}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close confirmation */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('listingForm.photos.closeConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('listingForm.photos.closeConfirmMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose}>
              {t('common.yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved crop confirmation */}
      <AlertDialog open={showUnsavedCropConfirm} onOpenChange={setShowUnsavedCropConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('listingForm.photos.unsavedCropTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('listingForm.photos.unsavedCropMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleStay}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndNavigate}>
              {t('listingForm.photos.saveDone')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
