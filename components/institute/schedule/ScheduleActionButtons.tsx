// ScheduleActionButtons — Add Slot, Smart Generate, and Publish gradient buttons.
// Also exposes `SecondaryActionRow` — a compact 2-up row used to pair
// Publish + Export PDF without stealing the visual weight that should belong
// to the primary Smart-Generate CTA at the top.
// Pure presentational: parent owns generating/publishing flags + onPress handlers.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type AddSlotProps = {
  label: string;
  onPress: () => void;
};

export function AddSlotButton({ label, onPress }: AddSlotProps) {
  return (
    <TouchableOpacity
      style={styles.addSlotBtn}
      onPress={() => { haptics.light(); onPress(); }}
    >
      <Ionicons name="add-circle" size={20} color={Colors.primary} />
      <Text style={styles.addSlotText}>{label}</Text>
    </TouchableOpacity>
  );
}

type SmartGenerateProps = {
  generating: boolean;
  generatingLabel: string;
  generateLabel: string;
  spinInterpolation: Animated.AnimatedInterpolation<string>;
  onPress: () => void;
};

export function SmartGenerateButton({
  generating,
  generatingLabel,
  generateLabel,
  spinInterpolation,
  onPress,
}: SmartGenerateProps) {
  return (
    <TouchableOpacity
      style={styles.smartBtn}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={generating}
    >
      <LinearGradient
        colors={['#020024', '#2F2FBA', '#00D4FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.smartBtnGradient}
      >
        {generating ? (
          <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
            <Ionicons name="sync" size={20} color="#fff" />
          </Animated.View>
        ) : (
          <Ionicons name="sparkles" size={20} color="#fff" />
        )}
        <Text style={styles.smartBtnText}>
          {generating ? generatingLabel : generateLabel}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

type ExportPDFProps = {
  exporting: boolean;
  label: string;
  exportingLabel: string;
  onPress: () => void;
};

export function ExportPDFButton({ exporting, label, exportingLabel, onPress }: ExportPDFProps) {
  return (
    <TouchableOpacity
      style={styles.exportBtn}
      onPress={onPress}
      disabled={exporting}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#1E40AF', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.exportBtnGradient}
      >
        {exporting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="document-text" size={18} color="#fff" />
            <Text style={styles.exportBtnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

type PublishProps = {
  publishing: boolean;
  label: string;
  onPress: () => void;
};

export function PublishButton({ publishing, label, onPress }: PublishProps) {
  return (
    <TouchableOpacity
      style={styles.publishBtn}
      onPress={onPress}
      disabled={publishing}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#065F46', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.publishBtnGradient}
      >
        {publishing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="paper-plane" size={18} color="#fff" />
            <Text style={styles.publishBtnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// SecondaryActionRow — pairs Publish + Export side-by-side as compact icon
// pills. We use this to keep the visual weight on Smart-Generate above and
// avoid the previous "three big stacked CTAs" feel that read as cluttered.
type SecondaryActionRowProps = {
  publishing: boolean;
  exporting: boolean;
  publishLabel: string;
  exportLabel: string;
  onPublish: () => void;
  onExport: () => void;
};

export function SecondaryActionRow({
  publishing,
  exporting,
  publishLabel,
  exportLabel,
  onPublish,
  onExport,
}: SecondaryActionRowProps) {
  return (
    <View style={styles.secondaryRow}>
      <TouchableOpacity
        style={[styles.secondaryBtn, styles.secondaryBtnPublish]}
        onPress={onPublish}
        disabled={publishing}
        activeOpacity={0.85}
      >
        {publishing ? (
          <ActivityIndicator color={tokens.color.success} size="small" />
        ) : (
          <>
            <Ionicons name="paper-plane" size={16} color={tokens.color.success} />
            <Text style={[styles.secondaryBtnText, { color: tokens.color.success }]}>
              {publishLabel}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, styles.secondaryBtnExport]}
        onPress={() => { haptics.light(); onExport(); }}
        disabled={exporting}
        activeOpacity={0.85}
      >
        {exporting ? (
          <ActivityIndicator color={tokens.color.brand600} size="small" />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={16} color={tokens.color.brand600} />
            <Text style={[styles.secondaryBtnText, { color: tokens.color.brand600 }]}>
              {exportLabel}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  addSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tokens.color.brand500,
    backgroundColor: tokens.color.brand50,
    marginTop: 12,
    marginBottom: 16,
  },
  addSlotText: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.brand600,
  },
  smartBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
    ...tokens.shadow.brand,
  },
  smartBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  smartBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  publishBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  publishBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  publishBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  exportBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  exportBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryBtnPublish: {
    backgroundColor: tokens.color.successBg,
    borderColor: 'rgba(5,150,105,0.18)',
  },
  secondaryBtnExport: {
    backgroundColor: tokens.color.brand100,
    borderColor: 'rgba(47,47,186,0.16)',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
