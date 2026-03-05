import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { createListingSchema, type CreateListingInput } from '@vithousing/shared';
import type { z } from 'zod';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
import { toast } from 'sonner';
import { Plus, X, Upload } from 'lucide-react';
import accommodationTypes from '@/data/accommodation-types.json';
import floorOptions from '@/data/floor-options.json';
import { ITALIAN_PROVINCES } from '@/lib/provinces';

interface PhotoFile {
  file: File;
  preview: string;
  uploading?: boolean;
  uploaded?: boolean;
  s3_key?: string;
  s3_url?: string;
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

const utilityFields = [
  { name: 'utility_electricity' as const, label: 'listingDetail.electricity' },
  { name: 'utility_gas' as const, label: 'listingDetail.gas' },
  { name: 'utility_water' as const, label: 'listingDetail.water' },
  { name: 'utility_telephone' as const, label: 'listingDetail.telephone' },
  { name: 'utility_internet' as const, label: 'listingDetail.internet' },
];

export function NewListingPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [showAvailableTo, setShowAvailableTo] = useState<boolean[]>([false]);

  type CreateListingFormValues = z.input<typeof createListingSchema>;

  const form = useForm<CreateListingFormValues, unknown, CreateListingInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
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
    },
  });

  const { fields: dateFields, append: appendDate, remove: removeDate } = useFieldArray({
    control: form.control,
    name: 'available_dates',
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    onDrop: (acceptedFiles) => {
      const newPhotos = acceptedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    },
  });

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: CreateListingInput) => {
      if (photos.length < 2) {
        throw new Error(t('listingForm.photos.minRequired'));
      }

      // Create the listing first
      const res = await api.post('/api/v1/listings', data);
      const listingId = res.data.listing.id;

      // Upload photos via presigned URLs
      for (const photo of photos) {
        const presignRes = await api.post('/api/v1/listings/photos/presign', {
          filename: photo.file.name,
          contentType: photo.file.type,
        });

        const { uploadUrl, s3Key, s3Url } = presignRes.data;

        await fetch(uploadUrl, {
          method: 'PUT',
          body: photo.file,
          headers: { 'Content-Type': photo.file.type },
        });

        await api.post(`/api/v1/listings/${listingId}/photos`, {
          s3_key: s3Key,
          s3_url: s3Url,
        });
      }

      return listingId;
    },
    onSuccess: (listingId) => {
      toast.success(t('common.save'));
      navigate(`/${lang}/listings/${listingId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onSubmit = (data: CreateListingInput) => {
    if (photos.length < 2) {
      toast.error(t('listingForm.photos.minRequired'));
      return;
    }
    createMutation.mutate(data);
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-3xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-3xl font-bold mb-8">{t('listingForm.createTitle')}</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Section 1: General */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionGeneral')}</h2>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('listingForm.postingTitle')} *</FormLabel>
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
                    <FormLabel>{t('listingForm.description')} *</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <Separator />

          {/* Section 2: Address */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionAddress')}</h2>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="address_1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('listingForm.address1')} *</FormLabel>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('listingForm.postalCode')} *</FormLabel>
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
                      <FormLabel>{t('listingForm.city')} *</FormLabel>
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
                  <FormItem>
                    <FormLabel>{t('listingForm.province')} *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            </div>
          </section>

          <Separator />

          {/* Section 3: Cost */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionCost')}</h2>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="monthly_rent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('listingForm.monthlyRent')} (€) *</FormLabel>
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
              <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                  {utilityFields.map((util) => (
                    <FormField
                      key={util.name}
                      control={form.control}
                      name={util.name}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="font-normal">{t(util.label)}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* Section 4: Dates Available */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionDates')}</h2>
            <div className="space-y-4">
              {dateFields.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-start border rounded-lg p-4">
                  <div className="flex-1 space-y-3">
                    <FormField
                      control={form.control}
                      name={`available_dates.${index}.available_from`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('listingForm.availableFrom')} *</FormLabel>
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
            </div>
          </section>

          <Separator />

          {/* Section 5: Listing Details */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionDetails')}</h2>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="accommodation_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('listingForm.accommodationType.label')} *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <FormLabel>{t('listingForm.floor.label')} *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <div className="grid grid-cols-3 gap-4">
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
            </div>
          </section>

          <Separator />

          {/* Section 6: Features */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionFeatures')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {featureFields.map((feature) => (
                <FormField
                  key={feature}
                  control={form.control}
                  name={feature}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value as boolean} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {t(`listingForm.features.${featureTranslationKeys[feature]}`)}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </section>

          <Separator />

          {/* Section 7: Photos */}
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('listingForm.sectionPhotos')}</h2>
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
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group aspect-square rounded-lg overflow-hidden">
                    <img
                      src={photo.preview}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded">
                        {t('listingForm.photos.coverPhoto')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 rounded-full bg-destructive p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive/90 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 2 && (
              <p className="mt-2 text-sm text-destructive">{t('listingForm.photos.minRequired')}</p>
            )}
          </section>

          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.loading') : t('listingForm.saveListing')}
            </Button>
          </div>
        </form>
      </Form>
    </motion.div>
  );
}
