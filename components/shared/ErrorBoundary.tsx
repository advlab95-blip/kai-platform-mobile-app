import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface Props {
  children: React.ReactNode;
  // Optional fallback UI override. Default shows a generic error screen with retry.
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  // Called once when an error is caught — good place to log to Sentry/analytics.
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * App-wide Error Boundary — catches render/lifecycle exceptions from children
 * and shows a recovery screen instead of letting the whole app crash.
 *
 * Wrap the root tree in app/_layout.tsx so any unhandled exception anywhere in
 * the app tree (teacher content, AI tools, realtime subscriptions...) lands here
 * instead of showing a white screen.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Persist details for the fallback UI
    this.setState({ errorInfo });
    // Report externally (best-effort; analytics should never throw themselves)
    try { this.props.onError?.(error, errorInfo); } catch { /* silent */ }
    // Also log to console so devs see the original stack, not just the boundary
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);

    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="warning" size={56} color={Colors.error} />
        <Text style={{ fontSize: 18, fontWeight: '900', color: Colors.text, marginTop: 16, textAlign: 'center' }}>
          حدث خطأ غير متوقّع
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          نحن نعمل على الإصلاح. حاول الرجوع أو إعادة تشغيل التطبيق.
        </Text>
        {__DEV__ && (
          <ScrollView style={{ maxHeight: 200, marginTop: 16, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12 }}>
            <Text style={{ fontSize: 11, color: Colors.error, fontFamily: 'monospace' }}>
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack?.split('\n').slice(0, 10).join('\n')}
            </Text>
          </ScrollView>
        )}
        <TouchableOpacity
          onPress={this.reset}
          style={{ marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
