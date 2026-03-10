import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

export interface FiltersState {
  minRent?: string;
  maxRent?: string;
  minBedrooms?: string;
  maxBedrooms?: string;
  minBathrooms?: string;
  maxBathrooms?: string;
  minFloorSpace?: string;
  maxFloorSpace?: string;
  sortBy: string;
  sortOrder: string;
}

interface SortOption {
  value: string;
  label: string;
}

interface ListingFiltersProps {
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
  onClear: () => void;
  sortOptions?: SortOption[];
}

export function ListingFilters({ filters, onChange, onClear, sortOptions }: ListingFiltersProps) {
  const { t } = useTranslation();

  const updateFilter = (key: keyof FiltersState, value: string) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const resolvedSortOptions = sortOptions ?? [
    { value: 'created_at-desc', label: t('listings.dateDesc') },
    { value: 'created_at-asc', label: t('listings.dateAsc') },
    { value: 'monthly_rent-asc', label: t('listings.rentAsc') },
    { value: 'monthly_rent-desc', label: t('listings.rentDesc') },
  ];

  const currentSort = `${filters.sortBy}-${filters.sortOrder}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('listings.filters')}</h3>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
          <X className="h-3 w-3 mr-1" />
          {t('listings.clearFilters')}
        </Button>
      </div>

      <div>
        <Label className="text-xs">{t('listings.sortBy')}</Label>
        <Select
          value={currentSort}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split('-');
            onChange({ ...filters, sortBy, sortOrder });
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resolvedSortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('listings.minRent')}</Label>
          <Input
            type="number"
            placeholder="€"
            value={filters.minRent || ''}
            onChange={(e) => updateFilter('minRent', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t('listings.maxRent')}</Label>
          <Input
            type="number"
            placeholder="€"
            value={filters.maxRent || ''}
            onChange={(e) => updateFilter('maxRent', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('listings.minBedrooms')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.minBedrooms || ''}
            onChange={(e) => updateFilter('minBedrooms', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t('listings.maxBedrooms')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.maxBedrooms || ''}
            onChange={(e) => updateFilter('maxBedrooms', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('listings.minBathrooms')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.minBathrooms || ''}
            onChange={(e) => updateFilter('minBathrooms', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t('listings.maxBathrooms')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.maxBathrooms || ''}
            onChange={(e) => updateFilter('maxBathrooms', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('listings.minFloorSpace')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.minFloorSpace || ''}
            onChange={(e) => updateFilter('minFloorSpace', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t('listings.maxFloorSpace')}</Label>
          <Input
            type="number"
            min="0"
            value={filters.maxFloorSpace || ''}
            onChange={(e) => updateFilter('maxFloorSpace', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
