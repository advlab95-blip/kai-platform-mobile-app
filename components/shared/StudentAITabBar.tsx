import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';

// Unified AI hub navigation — shown inside ai-tools / ai / ai-chat so the student
// can switch between the three AI sections without leaving the AI area.
type AITab = 'tools' | 'lessons' | 'chat';

interface Props {
  active: AITab;
}

const TABS: { key: AITab; label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { key: 'tools', label: 'أدوات', icon: 'sparkles', route: '/(student)/ai-tools' },
  { key: 'lessons', label: 'دروس', icon: 'bulb', route: '/(student)/ai' },
  { key: 'chat', label: 'مساعد', icon: 'chatbubble-ellipses', route: '/(student)/ai-chat' },
];

export default function StudentAITabBar({ active }: Props) {
  const router = useRouter();
  return (
    <View style={s.bar}>
      {TABS.map(t => {
        const isActive = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => {
              if (isActive) return;
              // Use push (not replace) so back navigation returns to the previous AI tab
              try { router.push(t.route as any); } catch {}
            }}
            style={[s.tab, isActive && s.tabActive]}
            activeOpacity={0.8}
          >
            <Ionicons name={t.icon} size={16} color={isActive ? '#fff' : Colors.textMuted} />
            <Text style={[s.label, isActive && s.labelActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  labelActive: {
    color: '#fff',
  },
});
