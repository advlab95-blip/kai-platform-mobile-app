import React from 'react';
import { ScrollView } from 'react-native';
import FilterChip from '../chips/FilterChip';
import { styles } from './styles';
import type { SubTab } from './_helpers';

export interface SubTabItem {
  key: SubTab;
  label: string;
  icon: string;
  navTarget?: string;
}

export interface SubTabsBarProps {
  tabs: SubTabItem[];
  activeTab: SubTab;
  onSelect: (tab: SubTabItem) => void;
}

/**
 * Horizontal sub-tabs scroller. Tabs with `navTarget` cause navigation;
 * the parent decides what to do via the onSelect callback.
 */
export default function SubTabsBar({ tabs, activeTab, onSelect }: SubTabsBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
      {tabs.map((tab) => (
        <FilterChip
          key={tab.key}
          label={tab.label}
          active={activeTab === tab.key}
          onPress={() => onSelect(tab)}
        />
      ))}
    </ScrollView>
  );
}
