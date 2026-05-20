import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './_styles';

type Props = {
  onlineCount: number;
  titleLabel: string;
  subtitleLabel: string;
};

// Live online users count card. Pure presentational — `onlineCount` is fed
// from presenceStore in the parent (Supabase Realtime, no polling).
export default function OnlineUsersCard({ onlineCount, titleLabel, subtitleLabel }: Props) {
  return (
    <View style={styles.onlineCardWrapper}>
      <LinearGradient
        colors={['#020024', '#2F2FBA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.onlineCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.onlineTitle}>{titleLabel}</Text>
          <Text style={styles.onlineSubtitle}>{subtitleLabel}</Text>
        </View>
        <View style={styles.onlineRight}>
          <View style={styles.greenDot} />
          <Text style={styles.onlineCount}>{onlineCount}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}
