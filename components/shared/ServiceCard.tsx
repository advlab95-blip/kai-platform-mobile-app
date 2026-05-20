import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';

type Props = {
  icon: string;
  label: string;
  color: string;
  route: string;
  badge?: number;
};

export default function ServiceCard({ icon, label, color, route, badge }: Props) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => { haptics.light(); router.push(route as any); }}
      activeOpacity={0.7}
    >
      <View style={[s.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={28} color={color} />
        {badge !== undefined && badge > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={s.label} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    width: '30%',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    margin: '1.5%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  label: { fontSize: 11, fontWeight: '700', color: Colors.text, textAlign: 'center', lineHeight: 16 },
});
