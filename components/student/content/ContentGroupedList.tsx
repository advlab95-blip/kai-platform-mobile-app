// ContentGroupedList — renders an array as subject-grouped sections with a divider header.
// Pure presentational. Parent computes the groups via groupBySubject and passes them in.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

export type Group<T> = {
  key: string;
  label: string;
  items: T[];
};

type Props<T> = {
  groups: Group<T>[];
  emptyText: string;
  isEmpty: boolean;
  itemRender: (item: T) => React.ReactElement;
};

export default function ContentGroupedList<T extends { id: string }>({
  groups,
  emptyText,
  isEmpty,
  itemRender,
}: Props<T>) {
  if (isEmpty) return <Text style={styles.emptyText}>{emptyText}</Text>;
  return (
    <View style={{ gap: 16 }}>
      {groups.map(group => (
        <View key={group.key}>
          <View style={styles.groupHeader}>
            <View style={styles.groupHeaderLine} />
            <View style={styles.groupHeaderLabel}>
              <Ionicons name="bookmark" size={13} color={tokens.color.teal600} />
              <Text style={styles.groupHeaderText}>
                {group.label}
              </Text>
              <View style={styles.groupHeaderCount}>
                <Text style={styles.groupHeaderCountText}>{group.items.length}</Text>
              </View>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            {group.items.map((item) => (
              <View key={(item as any).id}>{itemRender(item)}</View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 13,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
  // Group header (subject dividers)
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  groupHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: tokens.color.border,
  },
  groupHeaderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 10,
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: '900',
    color: tokens.color.teal700,
  },
  groupHeaderCount: {
    backgroundColor: tokens.color.teal100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    minWidth: 22,
    alignItems: 'center',
  },
  groupHeaderCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: tokens.color.teal700,
  },
});
