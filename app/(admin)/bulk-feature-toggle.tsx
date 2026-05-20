// Platform admin · Bulk Feature Toggle
// ────────────────────────────────────────────────────────────────────
// One-shot enable / disable of a feature flag for EVERY institute.
// Source of truth for feature definitions: stores/featureFlagsStore.ts
// (FEATURE_DEFINITIONS). The list is derived from there so adding a new
// feature in one place propagates everywhere.
// Data: services/platformAdminService.ts → bulkSetFeature (upsert on
// `feature_flags` keyed by institute_id + feature_key).

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';
import { confirmAlert, successAlert, errorAlert } from '../../utils/alerts';
import { bulkSetFeature } from '../../services/platformAdminService';
import { FEATURE_DEFINITIONS } from '../../stores/featureFlagsStore';

// Build the catalog from the canonical FEATURE_DEFINITIONS map so the
// list stays in sync with the rest of the app (admin features page,
// institute settings, etc.) automatically.
function buildFeatureCatalog(): Array<{ key: string; label: string; icon: keyof typeof Ionicons.glyphMap }> {
  return Object.entries(FEATURE_DEFINITIONS).map(([key, def]) => ({
    key,
    label: def.name,
    icon: def.icon as keyof typeof Ionicons.glyphMap,
  }));
}

export default function AdminBulkFeatureToggle() {
  // Track "which feature is currently being applied" so we can show a per-row
  // spinner and disable all toggles during the network round-trip.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const FEATURE_KEYS = useMemo(buildFeatureCatalog, []);

  const handleApply = (featureKey: string, label: string, enable: boolean) => {
    const verb = enable ? 'تفعيل' : 'تعطيل';
    confirmAlert(
      `${verb} الميزة`,
      `هل أنت متأكد من ${verb} "${label}" لكل المؤسسات؟`,
      async () => {
        setPendingKey(featureKey);
        haptics.medium();
        try {
          const res = await bulkSetFeature(featureKey, enable);
          successAlert(
            'تم التطبيق',
            `تم ${verb} "${label}" على ${res.updated} مؤسسة`,
          );
        } catch (e: any) {
          errorAlert('خطأ', e?.message || 'فشل تطبيق التغيير');
        } finally {
          setPendingKey(null);
        }
      },
      !enable, // disabling is the destructive path → red confirm button
      verb,
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="تفعيل ميزة لكل المؤسسات"
        subtitle="تطبيق دفعة واحدة"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Warning banner — visually distinct so it can't be missed. */}
        <View style={styles.warningBanner}>
          <View style={styles.warningIconWrap}>
            <Ionicons name="warning" size={18} color="#B45309" />
          </View>
          <Text style={styles.warningText}>
            هذا سيغيّر الميزة لكل المؤسسات. تأكد قبل التنفيذ.
          </Text>
        </View>

        <View style={styles.content}>
          {FEATURE_KEYS.map((f) => {
            const isPending = pendingKey === f.key;
            const anyPending = pendingKey !== null;
            return (
              <View key={f.key} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={f.icon} size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{f.label}</Text>
                    <Text style={styles.rowKey}>{f.key}</Text>
                  </View>
                </View>

                <View style={styles.rowActions}>
                  {isPending ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.toggleBtn, styles.enableBtn, anyPending && { opacity: 0.5 }]}
                        disabled={anyPending}
                        onPress={() => handleApply(f.key, f.label, true)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.toggleText}>تفعيل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleBtn, styles.disableBtn, anyPending && { opacity: 0.5 }]}
                        disabled={anyPending}
                        onPress={() => handleApply(f.key, f.label, false)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={styles.toggleText}>تعطيل</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          <Text style={styles.footerNote}>
            يتم التطبيق فوراً عبر upsert على جدول institute_features. الواجهات لدى المستخدمين تتحدث في الجلسة التالية.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  warningBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  warningIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#FDE68A',
    alignItems: 'center', justifyContent: 'center',
  },
  warningText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#92400E', textAlign: 'right', lineHeight: 18 },

  content: { paddingHorizontal: 16, paddingTop: 14 },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  rowLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  rowKey: { fontSize: 9, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },

  rowActions: { flexDirection: 'row-reverse', gap: 6, alignItems: 'center' },
  toggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  enableBtn: { backgroundColor: Colors.success },
  disableBtn: { backgroundColor: Colors.error },
  toggleText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  footerNote: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 8,
    lineHeight: 17,
  },
});
