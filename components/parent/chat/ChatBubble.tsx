// Single message bubble in the parent chat thread view (brief §7.4).
// Own messages: violet bg, white text, align-start (visual-left in RTL), bottom-left small radius.
// Other:       white bg, dark text, align-end, bottom-right small radius + subtle border.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

interface Props {
  text: string;
  mine: boolean;
  createdAt?: string;
}

function ChatBubble({ text, mine, createdAt }: Props) {
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
      <Text style={[styles.text, mine && styles.textMine]}>{text}</Text>
      {createdAt ? (
        <Text style={[styles.time, mine && styles.timeMine]}>
          {new Date(createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    padding: 12,
    marginBottom: 6,
  },
  mine: {
    backgroundColor: tokens.color.p600,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  other: {
    backgroundColor: tokens.color.surface,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  text: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 20,
  },
  textMine: { color: '#fff' },
  time: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'left',
    marginTop: 4,
  },
  timeMine: { color: 'rgba(255,255,255,0.65)' },
});

export default memo(ChatBubble);
