import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createListingSchema, type CreateListingInput } from '@vithousing/shared';
import type { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDropzone } from 'react-dropzone';
import {
  Plus, X, Upload, Star,
  FileText, MapPin, Euro, CalendarDays, Home, Sparkles, Camera,
  Zap, Flame, Droplets, Phone, Globe,
  Warehouse, ArrowDownToLine, TreePine, Fence, AirVent,
  WashingMachine, Wind, CookingPot, ArrowUpDown, Tv, Wifi,
  Cable, CarFront, PawPrint,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import accommodationTypes from '@/data/accommodation-types.json';
import floorOptions from '@/data/floor-options.json';
import { ITALIAN_PROVINCES } from '@/lib/provinces';
import { PhotoBatchDialog } from '@/components/photos/PhotoBatchDialog';
import { StepIndicator } from '@/components/ui/step-indicator';

export interface PhotoFile {
  file: File;
  preview: string;
  isMain: boolean;
}

export interface ExistingPhoto {
  id: number;
  url: string;
  sort_order: number;
}

interface SelectOption {
  value: string;
  labelKey: string;
}

const typedAccommodationTypes = accommodationTypes as SelectOption[];
const typedFloorOptions = floorOptions as SelectOption[];

const featureFields = [
  'feature_storage_room', 'feature_basement', 'feature_garden', 'feature_balcony',
  'feature_air_con', 'feature_washing_machine', 'feature_dryer', 'feature_fireplace',
  'feature_dishwasher', 'feature_elevator', 'feature_tv', 'feature_telephone',
  'feature_wifi', 'feature_wired_internet', 'feature_parking', 'feature_pets_allowed',
] as const;

const featureTranslationKeys: Record<string, string> = {
  feature_storage_room: 'storageRoom',
  feature_basement: 'basement',
  feature_garden: 'garden',
  feature_balcony: 'balcony',
  feature_air_con: 'airCon',
  feature_washing_machine: 'washingMachine',
  feature_dryer: 'dryer',
  feature_fireplace: 'fireplace',
  feature_dishwasher: 'dishwasher',
  feature_elevator: 'elevator',
  feature_tv: 'tv',
  feature_telephone: 'telephone',
  feature_wifi: 'wifi',
  feature_wired_internet: 'wiredInternet',
  feature_parking: 'parking',
  feature_pets_allowed: 'petsAllowed',
};

const featureIcons: Record<string, LucideIcon> = {
  feature_storage_room: Warehouse,
  feature_basement: ArrowDownToLine,
  feature_garden: TreePine,
  feature_balcony: Fence,
  feature_air_con: AirVent,
  feature_washing_machine: WashingMachine,
  feature_dryer: Wind,
  feature_fireplace: Flame,
  feature_dishwasher: CookingPot,
  feature_elevator: ArrowUpDown,
  feature_tv: Tv,
  feature_telephone: Phone,
  feature_wifi: Wifi,
  feature_wired_internet: Cable,
  feature_parking: CarFront,
  feature_pets_allowed: PawPrint,
};

const utilityFields = [
  { name: 'utility_electricity' as const, label: 'listingDetail.electricity', icon: Zap },
  { name: 'utility_gas' as const, label: 'listingDetail.gas', icon: Flame },
  { name: 'utility_water' as const, label: 'listingDetail.water', icon: Droplets },
  { name: 'utility_telephone' as const, label: 'listingDetail.telephone', icon: Phone },
  { name: 'utility_internet' as const, label: 'listingDetail.internet', icon: Globe },
];

const RequiredStar = () => (
  <span className="text-destructive" aria-hidden="true">
    *
  </span>
);

const EMPTY_PHOTOS: ExistingPhoto[] = [];

type StepFieldName = keyof CreateListingInput | 'available_dates';

interface WizardStep {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  fields: StepFieldName[];
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'propertyDetails',
    titleKey: 'listingForm.steps.propertyDetails',
    icon: Home,
    fields: ['title', 'description', 'accommodation_type', 'floor', 'bathrooms', 'bedrooms', 'floor_space'],
  },
  {
    id: 'address',
    titleKey: 'listingForm.steps.address',
    icon: MapPin,
    fields: ['address_1', 'address_2', 'postal_code', 'city', 'province'],
  },
  {
    id: 'cost',
    titleKey: 'listingForm.steps.cost',
    icon: Euro,
    fields: ['monthly_rent', 'deposit', 'condominium_expenses', 'utility_electricity', 'utility_gas', 'utility_water', 'utility_telephone', 'utility_internet'],
  },
  {
    id: 'features',
    titleKey: 'listingForm.steps.features',
    icon: Sparkles,
    fields: [...featureFields],
  },
  {
    id: 'availability',
    titleKey: 'listingForm.steps.availability',
    icon: CalendarDays,
    fields: ['available_dates'],
  },
];

const TOTAL_STEPS = WIZARD_STEPS.length;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

interface ListingFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<CreateListingInput>;
  existingPhotos?: ExistingPhoto[];
  onSubmit: (data: CreateListingInput, newPhotos: PhotoFile[], deletedPhotoIds: number[]) => void;
  isSubmitting: boolean;
}

export function ListingForm({ mode, initialData, existingPhotos = EMPTY_PHOTOS, onSubmit, isSubmitting }: ListingFormProps) {
  const { t } = useTranslation();
  const [newPhotos, setNewPhotos] = useState<PhotoFile[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<number[]>([]);
  const [keptExisting, setKeptExisting] = useState<ExistingPhoto[]>(existingPhotos);
  const newPhotosRef = useRef(newPhotos);
  newPhotosRef.current = newPhotos;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => mode === 'edit' ? new Set([1, 2, 3, 4, 5]) : new Set(),
  );
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    setKeptExisting(existingPhotos);
  }, [existingPhotos]);

  useEffect(() => {
    return () => {
      newPhotosRef.current.forEach((p) => { URL.revokeObjectURL(p.preview); });
    };
  }, []);

  // Pre-populate showAvailableTo based on initial data
  const initialDates = initialData?.available_dates;
  const initialShowTo = initialDates
    ? initialDates.map((d) => !!d.available_to)
    : [false];

  const [showAvailableTo, setShowAvailableTo] = useState<boolean[]>(initialShowTo);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  type CreateListingFormValues = z.input<typeof createListingSchema>;

  const defaultValues: CreateListingFormValues = {
    title: '',
    description: '',
    address_1: '',
    address_2: '',
    postal_code: '',
    city: '',
    province: 'Firenze',
    monthly_rent: 0,
    deposit: undefined,
    condominium_expenses: undefined,
    utility_electricity: false,
    utility_gas: false,
    utility_water: false,
    utility_telephone: false,
    utility_internet: false,
    accommodation_type: 'apartment',
    floor: 'ground',
    bathrooms: 1,
    bedrooms: 1,
    floor_space: undefined,
    ...Object.fromEntries(featureFields.map((f) => [f, false])),
    available_dates: [{ available_from: '' }],
    ...initialData,
  };

  const form = useForm<CreateListingFormValues, unknown, CreateListingInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues,
  });

  const { fields: dateFields, append: appendDate, remove: removeDate } = useFieldArray({
    control: form.control,
    name: 'available_dates',
  });

  const handleBatchComplete = useCallback((blobs: Blob[]) => {
    const photos: PhotoFile[] = blobs.map((blob, i) => {
      const file = new File([blob], `photo-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' });
      const preview = URL.createObjectURL(blob);
      return { file, preview, isMain: false };
    });
    setNewPhotos((prev) => {
      const combined = [...prev, ...photos];
      const hasMainExisting = keptExisting.length > 0 && !combined.some((p) => p.isMain);
      if (!hasMainExisting && !combined.some((p) => p.isMain) && combined.length > 0 && keptExisting.length === 0) {
        return combined.map((p, i) => (i === 0 ? { ...p, isMain: true } : p));
      }
      return combined;
    });
    setShowBatchDialog(false);
    setBatchFiles([]);
  }, [keptExisting.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setBatchFiles(acceptedFiles);
        setShowBatchDialog(true);
      }
    },
  });

  const removeNewPhoto = (index: number) => {
    setNewPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      const updated = prev.filter((_, i) => i !== index);
      if (prev[index].isMain && updated.length > 0) {
        return updated.map((p, i) => (i === 0 ? { ...p, isMain: true } : p));
      }
      return updated;
    });
  };

  const removeExistingPhoto = (photoId: number) => {
    setDeletedPhotoIds((prev) => [...prev, photoId]);
    setKeptExisting((prev) => prev.filter((p) => p.id !== photoId));
  };

  const setMainNewPhoto = (index: number) => {
    setNewPhotos((prev) =>
      prev.map((p, i) => ({ ...p, isMain: i === index })),
    );
  };

  const totalPhotos = keptExisting.length + newPhotos.length;

  const handleFormSubmit = (data: CreateListingInput) => {
    if (totalPhotos < 2) {
      return;
    }
    onSubmit(data, newPhotos, deletedPhotoIds);
  };

  // Wizard navigation
  const handleNext = async () => {
    const stepConfig = WIZARD_STEPS[currentStep - 1];
    const valid = await form.trigger(stepConfig.fields as unknown as Parameters<typeof form.trigger>[0]);
    if (!valid) return;
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    setDirection(1);
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setDirection(-1);
    setCurrentStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToStep = (step: number) => {
    if (completedSteps.has(step) || step < currentStep) {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const wizardStepLabels = WIZARD_STEPS.map((s) => ({
    id: s.id,
    label: t(s.titleKey),
  }));

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)}>
          <StepIndicator
            steps={wizardStepLabels}
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={goToStep}
          />

          <AnimatePresence mode="wait" custom={direction}>
            {/* Step 1: Property Details (General + Listing Details) */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-8"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileText className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionGeneral')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('listingForm.postingTitle')} <RequiredStar /></FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('listingForm.description')} <RequiredStar /></FormLabel>
                          <FormControl>
                            <textarea
                              className="flex min-h-[120px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Home className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionDetails')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="accommodation_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.accommodationType.label')} <RequiredStar /></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {typedAccommodationTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {t(type.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="floor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.floor.label')} <RequiredStar /></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {typedFloorOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {t(opt.labelKey)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <FormField
                        control={form.control}
                        name="bathrooms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.bathrooms')}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bedrooms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.bedrooms')}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="floor_space"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.floorSpace')}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0"
                                  className="pr-16"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  {t('listingForm.floorSpaceSuffix')}
                                </span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 2: Address */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <MapPin className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionAddress')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="address_1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('listingForm.address1')} <RequiredStar /></FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('listingForm.address2')}</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="postal_code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.postalCode')} <RequiredStar /></FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.city')} <RequiredStar /></FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="province"
                      render={({ field }) => (
                        <FormItem className="max-w-sm">
                          <FormLabel>{t('listingForm.province')} <RequiredStar /></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ITALIAN_PROVINCES.map((prov) => (
                                <SelectItem key={prov} value={prov}>
                                  {prov}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 3: Cost */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Euro className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionCost')}
                    </CardTitle>
                    <CardDescription>{t('listingForm.sectionCostDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="monthly_rent"
                      render={({ field }) => (
                        <FormItem className="max-w-sm">
                          <FormLabel>{t('listingForm.monthlyRent')} (€) <RequiredStar /></FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                              <Input
                                type="number"
                                className="pl-8"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="deposit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.deposit')} (€)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                                <Input
                                  type="number"
                                  className="pl-8"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="condominium_expenses"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('listingForm.condominiumExpenses')} (€)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                                <Input
                                  type="number"
                                  className="pl-8"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <FormLabel>{t('listingForm.utilitiesIncluded')}</FormLabel>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mt-2">
                        {utilityFields.map((util) => (
                          <FormField
                            key={util.name}
                            control={form.control}
                            name={util.name}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={!!field.value}
                                    onClick={() => field.onChange(!field.value)}
                                    className={cn(
                                      "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors",
                                      field.value
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-muted hover:border-primary/30 text-muted-foreground"
                                    )}
                                  >
                                    <util.icon className="h-5 w-5" />
                                    <span className="text-xs font-medium leading-tight">{t(util.label)}</span>
                                  </button>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 4: Features */}
            {currentStep === 4 && (
              <motion.div
                key="step-4"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Sparkles className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionFeatures')}
                    </CardTitle>
                    <CardDescription>{t('listingForm.sectionFeaturesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                      {featureFields.map((feature) => {
                        const Icon = featureIcons[feature];
                        return (
                          <FormField
                            key={feature}
                            control={form.control}
                            name={feature}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={!!field.value}
                                    onClick={() => field.onChange(!field.value)}
                                    className={cn(
                                      "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors",
                                      field.value
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-muted hover:border-primary/30 text-muted-foreground"
                                    )}
                                  >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-xs font-medium leading-tight">
                                      {t(`listingForm.features.${featureTranslationKeys[feature]}`)}
                                    </span>
                                  </button>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 5: Availability & Photos */}
            {currentStep === 5 && (
              <motion.div
                key="step-5"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-8"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <CalendarDays className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionDates')}
                    </CardTitle>
                    <CardDescription>{t('listingForm.sectionDatesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {dateFields.map((field, index) => (
                      <div key={field.id} className="flex gap-4 items-start border rounded-lg p-4">
                        <div className="flex-1 space-y-3">
                          <FormField
                            control={form.control}
                            name={`available_dates.${index}.available_from`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('listingForm.availableFrom')} <RequiredStar /></FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} value={field.value as string} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={showAvailableTo[index] || false}
                              onCheckedChange={(checked) => {
                                const newShow = [...showAvailableTo];
                                newShow[index] = !!checked;
                                setShowAvailableTo(newShow);
                                if (!checked) {
                                  form.setValue(`available_dates.${index}.available_to`, undefined);
                                }
                              }}
                            />
                            <label className="text-sm">{t('listingForm.showAvailableTo')}</label>
                          </div>
                          {showAvailableTo[index] && (
                            <FormField
                              control={form.control}
                              name={`available_dates.${index}.available_to`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t('listingForm.availableTo')}</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} value={(field.value as string) || ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              removeDate(index);
                              setShowAvailableTo((prev) => prev.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        appendDate({ available_from: '' });
                        setShowAvailableTo((prev) => [...prev, false]);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('listingForm.addPeriod')}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Camera className="h-5 w-5 text-primary" />
                      {t('listingForm.sectionPhotos')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">{t('listingForm.photos.dragDrop')}</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3">
                        {t('listingForm.photos.browse')}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">{t('listingForm.photos.acceptedFormats')}</p>
                      <p className="text-xs text-muted-foreground">{t('listingForm.photos.minDimensions')}</p>
                    </div>

                    {(keptExisting.length > 0 || newPhotos.length > 0) && (
                      <>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 mt-4">
                          {keptExisting.map((photo) => (
                            <div
                              key={`existing-${photo.id}`}
                              className="relative group aspect-square rounded-lg overflow-hidden"
                            >
                              <img
                                src={photo.url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              {photo.sort_order === 0 && (
                                <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Star className="h-3 w-3" />
                                  {t('listingForm.photos.mainPhotoBadge')}
                                </span>
                              )}
                              <button
                                type="button"
                                aria-label={t('listingForm.photos.removePhoto', { index: photo.sort_order + 1 })}
                                onClick={() => removeExistingPhoto(photo.id)}
                                className="absolute top-1 right-1 rounded-full bg-destructive p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive/90 group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {newPhotos.map((photo, index) => (
                            <div
                              key={`new-${index}`}
                              role="button"
                              tabIndex={0}
                              className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer"
                              onClick={() => setMainNewPhoto(index)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setMainNewPhoto(index);
                                }
                              }}
                              title={t('listingForm.photos.setAsMain')}
                              aria-label={`${t('listingForm.photos.setAsMain')} - ${t('listingForm.photos.photoLabel', { index: keptExisting.length + index + 1 })}${photo.isMain ? ` (${t('listingForm.photos.mainPhotoBadge')})` : ''}`}
                            >
                              <img
                                src={photo.preview}
                                alt={t('listingForm.photos.photoLabel', { index: keptExisting.length + index + 1 })}
                                className="w-full h-full object-cover"
                              />
                              {photo.isMain && keptExisting.length === 0 && (
                                <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Star className="h-3 w-3" />
                                  {t('listingForm.photos.mainPhotoBadge')}
                                </span>
                              )}
                              <button
                                type="button"
                                aria-label={t('listingForm.photos.removePhoto', { index: keptExisting.length + index + 1 })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNewPhoto(index);
                                }}
                                className="absolute top-1 right-1 rounded-full bg-destructive p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive/90 group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{t('listingForm.photos.changeMainHint')}</p>
                      </>
                    )}
                    {totalPhotos < 2 && (
                      <p className="mt-2 text-sm text-destructive">{t('listingForm.photos.minRequired')}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sticky wizard footer */}
          <div className="sticky bottom-0 z-10 -mx-6 lg:-mx-11 mt-8 border-t bg-background/80 px-6 lg:px-11 py-4 backdrop-blur-sm flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t('listingForm.stepOf', { current: currentStep, total: TOTAL_STEPS })}
            </span>
            <div className="flex gap-3">
              {currentStep > 1 && (
                <Button type="button" variant="outline" size="lg" onClick={handleBack}>
                  {t('listingForm.back')}
                </Button>
              )}
              {currentStep < TOTAL_STEPS ? (
                <Button type="button" size="lg" onClick={handleNext}>
                  {t('listingForm.next')}
                </Button>
              ) : (
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting
                    ? t('common.loading')
                    : mode === 'edit'
                      ? t('listingForm.updateListing')
                      : t('listingForm.saveListing')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>

      <PhotoBatchDialog
        open={showBatchDialog}
        files={batchFiles}
        onComplete={handleBatchComplete}
        onCancel={() => {
          setShowBatchDialog(false);
          setBatchFiles([]);
        }}
      />
    </>
  );
}
