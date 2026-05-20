// "Latest records" section on the medical home.
// Receives the already-sliced 5 records from the parent so we don't compute here.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { RecentRecordRow, RecordRowData } from '../cards/StudentRecordRow';

interface Props {
  records: RecordRowData[];
  onSelect: (record: RecordRowData) => void;
}

function RecentRecords({ records, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('medical.latestRecords')}</Text>
      {records.length === 0 ? (
        <Text style={styles.emptyText}>{t('medical.noMedicalRecords')}</Text>
      ) : (
        records.map((record, idx) => (
          <RecentRecordRow
            key={record.id || idx}
            record={record}
            onPress={() => onSelect(record)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginTop: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
});

export default memo(RecentRecords);
