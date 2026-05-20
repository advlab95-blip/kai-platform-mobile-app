import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, SectionList, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { globalSearch, type SearchResult, type SearchCategory } from '../../services/search';
import SwipeableSheet from './SwipeableSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<SearchCategory, string> = {
  student:      'الطلاب',
  teacher:      'المعلمون',
  subject:      'المواد',
  assignment:   'الواجبات',
  exam:         'الامتحانات',
};

const CATEGORY_ORDER: SearchCategory[] = [
  'student', 'teacher', 'subject', 'assignment', 'exam',
];

export default function GlobalSearch({ visible, onClose }: Props) {
  const router = useRouter();
  const { userId, role } = useAuthStore();
  const { userInstituteId } = useDataStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 400);

  // Reset on open/close so the modal always starts fresh.
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (!userId || !role) return;
    // Platform admin (role === 'admin') can search across all institutes when
    // no specific institute is in context — userInstituteId may be null.
    if (role !== 'admin' && !userInstituteId) return;
    const q = debounced.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const data = await globalSearch(q, role, userInstituteId ?? null, userId, 30);
        if (!alive) return;
        setResults(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [debounced, visible, userId, role, userInstituteId]);

  // Group results by category for a SectionList.
  const sections = useMemo(() => {
    const byCat = new Map<SearchCategory, SearchResult[]>();
    for (const r of results) {
      const arr = byCat.get(r.category) ?? [];
      arr.push(r);
      byCat.set(r.category, arr);
    }
    return CATEGORY_ORDER
      .filter((c) => byCat.has(c))
      .map((c) => ({
        title: CATEGORY_LABEL[c],
        category: c,
        data: byCat.get(c) ?? [],
      }));
  }, [results]);

  const handleOpen = (r: SearchResult) => {
    Keyboard.dismiss();
    onClose();
    setTimeout(() => {
      try { router.push(r.route as any); } catch { /* ignore invalid route */ }
    }, 120);
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.9}>
      {/* Header / input */}
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق">
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث عن طالب، مادة، واجب…"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          autoFocus
          returnKeyType="search"
          textAlign="right"
          accessibilityLabel="حقل البحث"
        />
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
      </View>

      {/* Body */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : debounced.trim().length < 2 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="search-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            ابدأ الكتابة للبحث بالاسم أو العنوان
          </Text>
          <Text style={styles.emptyHint}>حرفان فأكثر</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="file-tray-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyText}>لا نتائج</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.category}-${item.id}`}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleOpen(item)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                {!!item.subtitle && (
                  <Text style={styles.rowSub} numberOfLines={1}>{item.subtitle}</Text>
                )}
              </View>
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  input: {
    flex: 1, fontSize: 15, color: Colors.text,
    textAlign: 'right',
    paddingVertical: 0,
  },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  emptyHint: { color: Colors.textMuted, fontSize: 12 },
  sectionHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    backgroundColor: Colors.background,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  sectionCount: { fontSize: 11, color: Colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    marginHorizontal: 12, marginVertical: 3,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rowSub: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
});
