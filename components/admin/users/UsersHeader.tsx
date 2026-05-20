import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './_styles';

type Props = {
  title: string;
  subtitle: string;
};

export default function UsersHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.header}>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}
