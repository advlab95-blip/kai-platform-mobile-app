// Cafeteria menu — list/add/toggle/delete menu items.
// Data flow:
//   useCafeteriaStore → items / loadItems / addItem / toggleAvailability / deleteItem
//   useDataStore.userInstituteId guards every call.
//   Feature gate: useFeatureFlag('cafeteria') → <LockedScreen />.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useDataStore from '../../stores/dataStore';
import useCafeteriaStore from '../../stores/cafeteriaStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { haptics } from '../../utils/haptics';
import MenuItemRow, { CafeteriaItem } from '../../components/cafeteria/menu/MenuItemRow';
import AddItemSheet from '../../components/cafeteria/menu/AddItemSheet';
import LockedScreen from '../../components/cafeteria/shared/LockedScreen';
import ConfirmSheet from '../../components/teacher/sheets/ConfirmSheet';

export default function CafeteriaMenu() {
  const { t } = useTranslation();
  const { userInstituteId } = useDataStore();
  const { items, loadItems, addItem, toggleAvailability, deleteItem, subscribeToItems } = useCafeteriaStore();
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const isEnabled = useFeatureFlag('cafeteria');

  useEffect(() => {
    if (userInstituteId) loadItems(userInstituteId);
  }, [userInstituteId]);

  // Realtime: another device (or the cafeteria home tab) editing the menu
  // pushes INSERT/UPDATE/DELETE — server-filtered by institute_id, so no
  // cross-tenant traffic. Cleanup unsubscribes on unmount or institute change.
  useEffect(() => {
    if (!userInstituteId) return;
    const unsubscribe = subscribeToItems(userInstituteId);
    return unsubscribe;
  }, [userInstituteId, subscribeToItems]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userInstituteId) await loadItems(userInstituteId);
    } finally {
      setRefreshing(false);
    }
  }, [userInstituteId]);

  const handleAdd = useCallback(
    async (name: string, price: number, category: string, imageUrl: string | null) => {
      try {
        if (userInstituteId) {
          await addItem(name, price, userInstituteId, {
            category: category || null,
            image_url: imageUrl,
          });
        }
        Alert.alert(t('common.success'), t('cafeteria.productAdded'));
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('cafeteria.addFailed'));
      }
    },
    [userInstituteId, addItem, t],
  );

  const handleRequestDelete = useCallback((id: string, name: string) => {
    setPendingDelete({ id, name });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await deleteItem(pendingDelete.id, userInstituteId || undefined);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('cafeteria.deleteFailed'));
    }
  }, [pendingDelete, deleteItem, userInstituteId, t]);

  const handleToggle = useCallback(
    async (itemId: string, currentAvailable: boolean) => {
      try {
        await toggleAvailability(itemId, !currentAvailable, userInstituteId || undefined);
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('cafeteria.updateFailed2'));
      }
    },
    [toggleAvailability, userInstituteId, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: CafeteriaItem }) => (
      <MenuItemRow item={item} onToggle={handleToggle} onDelete={handleRequestDelete} />
    ),
    [handleToggle, handleRequestDelete],
  );

  const keyExtractor = useCallback(
    (item: CafeteriaItem, idx: number) => item.id || `${idx}`,
    [],
  );

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('cafeteria.menu')}
        gradient={tokens.gradient.cafeteria}
        glowAccent="rgba(249,115,22,0.35)"
        showBack={false}
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            haptics.selection();
            setAddVisible(true);
          }}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel={t('cafeteria.addProduct')}
        >
          <LinearGradient
            colors={tokens.gradient.orange}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addBtnGradient}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>{t('cafeteria.addProduct')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlashList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('cafeteria.noProducts')}</Text>}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.o600}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />

      <AddItemSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSubmit={handleAdd}
      />

      <ConfirmSheet
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete', { defaultValue: 'حذف' })}
        message={
          pendingDelete
            ? t('cafeteria.deleteConfirm', { name: pendingDelete.name })
            : ''
        }
        confirmLabel={t('common.delete', { defaultValue: 'حذف' })}
        destructive
        onConfirm={handleConfirmDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
  },
  addBtn: { borderRadius: tokens.radius.md, overflow: 'hidden', ...tokens.shadow.cafeteria },
  addBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: '#fff',
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
