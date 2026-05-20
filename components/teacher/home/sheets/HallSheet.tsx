// HallSheet — bottom sheet for cafeteria order: shows recent order statuses,
// product list with quantity controls, location field, and submit button. Parent owns
// all state and handlers.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import { tokens } from '../../../../constants/designTokens';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

type Props = {
  visible: boolean;
  onClose: () => void;
  myOrders: any[];
  cafeteriaItems: any[];
  cafeteriaLoading: boolean;
  orderCart: Record<string, number>;
  orderLocation: string;
  sending: boolean;
  cartItemCount: number;
  cartTotal: number;
  onRefreshMyOrders: () => void;
  onUpdateCartQuantity: (itemId: string, delta: number) => void;
  onChangeLocation: (txt: string) => void;
  onSubmit: () => void;
};

export default function HallSheet({
  visible,
  onClose,
  myOrders,
  cafeteriaItems,
  cafeteriaLoading,
  orderCart,
  orderLocation,
  sending,
  cartItemCount,
  cartTotal,
  onRefreshMyOrders,
  onUpdateCartQuantity,
  onChangeLocation,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.88}>
      <KeyboardAwareScroll
        style={styles.sheetBody}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('teacherHome.orderFromCafeteria')}</Text>
          </View>

          {/* Order status tracker — shows teacher's last 5 orders with live status. */}
          {myOrders.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'right' }}>
                  طلباتي الأخيرة
                </Text>
                <TouchableOpacity onPress={onRefreshMyOrders} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="refresh" size={14} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                {myOrders.map((o: any) => {
                  const statusMap: Record<string, { bg: string; color: string; label: string; icon: any }> = {
                    new: { bg: '#DBEAFE', color: '#1E40AF', label: 'جديد', icon: 'time-outline' },
                    pending: { bg: '#DBEAFE', color: '#1E40AF', label: 'جديد', icon: 'time-outline' },
                    preparing: { bg: '#FEF3C7', color: '#92400E', label: 'قيد التحضير', icon: 'restaurant-outline' },
                    ready: { bg: '#D1FAE5', color: '#065F46', label: 'جاهز — بانتظار الاستلام', icon: 'checkmark-circle-outline' },
                    delivered: { bg: '#F1F5F9', color: Colors.textMuted, label: 'تم التسليم', icon: 'checkmark-done-outline' },
                  };
                  const st = statusMap[o.status] || statusMap.new;
                  const itemsSummary = Array.isArray(o.items)
                    ? o.items.map((i: any) => `${i.item_name} ×${i.quantity}`).join('، ')
                    : '';
                  return (
                    <View key={o.id} style={{
                      backgroundColor: st.bg, borderRadius: 10, padding: 10,
                      marginBottom: 6, borderWidth: 1, borderColor: st.color + '40',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name={st.icon} size={12} color={st.color} />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: st.color }}>{st.label}</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                          {o.location ? `${o.location} · ` : ''}{new Date(o.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      {itemsSummary && (
                        <Text style={{ fontSize: 11, color: Colors.text, textAlign: 'right', marginTop: 4 }} numberOfLines={2}>
                          {itemsSummary}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {cafeteriaLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 30 }} />
          ) : cafeteriaItems.length === 0 ? (
            <Text style={styles.emptyText}>{t('teacherHome.noProductsAvailable')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {cafeteriaItems.filter((item: any) => item.available !== false).map((item: any) => {
                const qty = orderCart[item.id] || 0;
                return (
                  <View key={item.id} style={styles.cafeteriaItem}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.cafeteriaItemImage} />
                    ) : (
                      <View style={[styles.cafeteriaItemImage, styles.cafeteriaItemImageFallback]}>
                        <Ionicons name="fast-food" size={20} color={tokens.color.text3} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cafeteriaItemName}>{item.name}</Text>
                      {item.category ? (
                        <Text style={styles.cafeteriaItemCategory} numberOfLines={1}>{item.category}</Text>
                      ) : null}
                      <Text style={styles.cafeteriaItemPrice}>{item.price} {t('teacherHome.iqd')}</Text>
                    </View>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, qty === 0 && { opacity: 0.3 }]}
                        onPress={() => onUpdateCartQuantity(item.id, -1)}
                        disabled={qty === 0}
                      >
                        <Ionicons name="remove" size={16} color={Colors.primary} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => onUpdateCartQuantity(item.id, 1)}
                      >
                        <Ionicons name="add" size={16} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Order summary */}
          {cartItemCount > 0 && (
            <View style={styles.orderSummary}>
              <Text style={styles.orderSummaryText}>
                {t('teacherHome.cartSummary', { items: cartItemCount, total: cartTotal })}
              </Text>
            </View>
          )}

          {/* Location input */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('teacherHome.hallOrClassNumber')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('teacherHome.hallPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={orderLocation}
            onChangeText={onChangeLocation}
            textAlign="right"
          />

          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={onSubmit}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>{t('teacherHome.sendOrder')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.text2,
    textAlign: 'right',
    marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.text,
    marginBottom: 10,
  },
  sendBtn: {
    backgroundColor: tokens.color.brand500,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 13,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  cafeteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  cafeteriaItemImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.color.surface2,
  },
  cafeteriaItemImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cafeteriaItemCategory: {
    fontSize: 10,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  cafeteriaItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'right',
  },
  cafeteriaItemPrice: {
    fontSize: 11,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.color.surface2,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.text,
    minWidth: 20,
    textAlign: 'center',
  },
  orderSummary: {
    backgroundColor: tokens.color.brand100,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  orderSummaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.brand500,
  },
});
