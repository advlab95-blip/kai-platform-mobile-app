// QRScannerModal — full-screen Camera + frame overlay for QR attendance scan.
// Parent owns: visibility, scanned/scanLoading flags, the actual scan handler (which calls
// api.scanQRAttendance and notifies parent on success). This component is a controlled view.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../../constants/designTokens';
import { haptics } from '../../../../utils/haptics';

type Props = {
  visible: boolean;
  scanned: boolean;
  scanLoading: boolean;
  onClose: () => void;
  onScan: (payload: { data: string }) => void;
};

export default function QRScannerModal({
  visible,
  scanned,
  scanLoading,
  onClose,
  onScan,
}: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => { haptics.light(); onClose(); }}
            style={styles.closeBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {t('student.scanQR', { defaultValue: 'مسح رمز الحضور' })}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {scanLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>
              {t('student.recordingAttendance', { defaultValue: 'جاري تسجيل الحضور...' })}
            </Text>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : onScan}
          />
        )}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
        </View>
        <Text style={styles.hint}>
          {t('student.pointCameraAtQR', { defaultValue: 'وجّه الكاميرا نحو رمز QR' })}
        </Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: '#fff',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    top: 80,
  },
  frame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 20,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: tokens.font.size.lg,
    fontWeight: '700',
    textAlign: 'center',
    paddingBottom: 30,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: tokens.font.size.xl,
    fontWeight: '700',
  },
});
