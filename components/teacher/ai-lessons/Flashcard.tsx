import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './styles';

/**
 * Tap-to-flip flashcard. Face shows the concept; tap reveals the definition.
 * Built without animation libs so it renders instantly even on low-end devices.
 */
export default function Flashcard({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.flashCard, flipped && styles.flashCardBack]}
      onPress={() => setFlipped(!flipped)}
      activeOpacity={0.85}
    >
      <Text style={[styles.flashFace, flipped && { color: '#fff' }]}>
        {flipped ? back : front}
      </Text>
      <Ionicons
        name="swap-horizontal"
        size={14}
        color={flipped ? 'rgba(255,255,255,0.7)' : Colors.textMuted}
        style={{ alignSelf: 'flex-end' }}
      />
    </TouchableOpacity>
  );
}
