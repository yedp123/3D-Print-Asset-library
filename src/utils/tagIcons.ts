import React from 'react';
import {
  User,
  Car,
  Armchair,
  Building2,
  Package,
  Trees,
  Cog,
  Layers,
  Tag as TagIcon,
  LucideProps,
} from 'lucide-react';

export const TAG_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  User,
  Car,
  Armchair,
  Building2,
  Package,
  Trees,
  Cog,
  Layers,
  Tag: TagIcon,
};

export function getTagIconComponent(iconName?: string): React.ComponentType<LucideProps> {
  if (iconName && TAG_ICONS[iconName]) {
    return TAG_ICONS[iconName];
  }
  return TagIcon;
}
