import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface BreadcrumbItem {
  label: string;
  route?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const router = useRouter();

  return (
    <View style={s.container}>
      {items.map((item, idx) => (
        <View key={idx} style={s.item}>
          {idx > 0 && <Ionicons name="chevron-back" size={14} color="#CBD5E1" style={{ marginHorizontal: 4 }} />}
          {item.route && idx < items.length - 1 ? (
            <TouchableOpacity onPress={() => router.push(item.route as any)} accessibilityLabel={item.label} accessibilityRole="link">
              <Text style={s.link}>{item.label}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.current}>{item.label}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center' },
  link: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  current: { fontSize: 12, fontWeight: '800', color: Colors.text },
});
