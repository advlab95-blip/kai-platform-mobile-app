// ContentPdfChatModal — PDF chat-with-AI modal (presentational).
// Parent owns chatPdf/chatMessages/chatInput/chatSending state and the send handler.

import React from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Props = {
  chatPdf: any | null;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatSending: boolean;
  chatRef: React.RefObject<FlashListRef<any> | null>;
  onChangeInput: (v: string) => void;
  onClose: () => void;
  onSend: () => void;
};

export default function ContentPdfChatModal({
  chatPdf,
  chatMessages,
  chatInput,
  chatSending,
  chatRef,
  onChangeInput,
  onClose,
  onSend,
}: Props) {
  return (
    <Modal visible={!!chatPdf} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {/* Chat Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: tokens.color.surface, borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
          <TouchableOpacity
            onPress={() => { haptics.light(); onClose(); }}
            style={{ width: 36, height: 36, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface2, alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel="إغلاق"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color={tokens.color.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: tokens.color.text }} numberOfLines={1}>اسأل عن: {chatPdf?.title}</Text>
            <Text style={{ fontSize: 10, color: tokens.color.purple, fontWeight: '700' }}>مدعوم بالذكاء الاصطناعي</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Messages */}
        <FlashList
          ref={chatRef}
          data={chatMessages}
          keyExtractor={(_, i) => `${i}`}
          renderItem={({ item: msg }) => (
            <View style={{ maxWidth: '82%', padding: 12, borderRadius: 18, marginBottom: 8,
              ...(msg.role === 'user'
                ? { alignSelf: 'flex-start', backgroundColor: tokens.color.teal600, borderBottomLeftRadius: 4 }
                : { alignSelf: 'flex-end', backgroundColor: tokens.color.surface, borderBottomRightRadius: 4, borderWidth: 1, borderColor: tokens.color.border })
            }}>
              <Text style={{ fontSize: 14, fontWeight: '600', lineHeight: 22, textAlign: 'right',
                color: msg.role === 'user' ? '#fff' : tokens.color.text
              }}>{msg.content}</Text>
            </View>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          onContentSizeChange={() => chatRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={tokens.color.surface3} />
              <Text style={{ fontSize: 14, color: tokens.color.text3, marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
                اسأل أي سؤال عن "{chatPdf?.title}"{'\n'}والـ AI راح يجاوبك من محتوى الملف فقط
              </Text>
            </View>
          }
        />

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: tokens.color.surface, borderTopWidth: 1, borderTopColor: tokens.color.border, gap: 8 }}>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.purple, alignItems: 'center', justifyContent: 'center', opacity: (!chatInput.trim() || chatSending) ? 0.5 : 1 }}
              disabled={!chatInput.trim() || chatSending}
              onPress={() => { haptics.light(); onSend(); }}
            >
              {chatSending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
            </TouchableOpacity>
            <TextInput
              style={{ flex: 1, backgroundColor: tokens.color.surface2, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: tokens.color.text, maxHeight: 100, borderWidth: 1, borderColor: tokens.color.border }}
              placeholder="اسأل سؤال عن الملف..."
              placeholderTextColor={tokens.color.text3}
              value={chatInput}
              onChangeText={onChangeInput}
              textAlign="right"
              multiline
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
