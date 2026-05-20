// Drop-in replacement for ScrollView on screens with TextInputs.
// Uses the platform keyboard event to push focused inputs above the on-screen
// keyboard, so the user always sees what they're typing — same UX whether they
// edit a profile, fill an exam form, or compose a message. JS-only (OTA-safe).
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  View,
  Keyboard,
  KeyboardEvent,
  Platform,
  StyleSheet,
  TextInput,
  findNodeHandle,
  UIManager,
} from 'react-native';

type Props = ScrollViewProps & {
  /** Extra padding (px) added below the focused input above the keyboard. Default 16. */
  extraScrollHeight?: number;
  /** When false, skips auto-scroll-to-focused-input (only the bottom padding lift remains). */
  enableAutoScroll?: boolean;
};

const KeyboardAwareScroll = forwardRef<ScrollView, Props>(
  (
    {
      children,
      extraScrollHeight = 16,
      enableAutoScroll = true,
      contentContainerStyle,
      keyboardShouldPersistTaps = 'handled',
      ...rest
    },
    forwardedRef,
  ) => {
    const scrollRef = useRef<ScrollView | null>(null);
    const [kbHeight, setKbHeight] = useState(0);

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const onShow = (e: KeyboardEvent) => {
        setKbHeight(e.endCoordinates?.height || 0);
        if (!enableAutoScroll) return;
        const focused = TextInput.State.currentlyFocusedInput?.() as any;
        const focusedHandle = focused ? findNodeHandle(focused) : null;
        const scrollNode = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
        if (!focusedHandle || !scrollNode) return;
        // Wait one frame so Modal/sheet animations finish before measuring.
        setTimeout(() => {
          UIManager.measureLayout(
            focusedHandle,
            scrollNode,
            () => {},
            (_x, y, _w, h) => {
              const target = Math.max(0, y - extraScrollHeight);
              scrollRef.current?.scrollTo({ y: target + h, animated: true });
            },
          );
        }, 50);
      };
      const onHide = () => setKbHeight(0);

      const showSub = Keyboard.addListener(showEvent, onShow);
      const hideSub = Keyboard.addListener(hideEvent, onHide);
      return () => { showSub.remove(); hideSub.remove(); };
    }, [enableAutoScroll, extraScrollHeight]);

    const setRef = (instance: ScrollView | null) => {
      scrollRef.current = instance;
      if (typeof forwardedRef === 'function') forwardedRef(instance);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<ScrollView | null>).current = instance;
    };

    return (
      <ScrollView
        ref={setRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={[
          contentContainerStyle,
          // Add bottom padding equal to keyboard height so the last fields
          // are scrollable into view even if they sit at the bottom of the form.
          kbHeight > 0 ? { paddingBottom: kbHeight + extraScrollHeight } : null,
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    );
  },
);

KeyboardAwareScroll.displayName = 'KeyboardAwareScroll';

export default KeyboardAwareScroll;

// Convenience wrapper for screens that don't need scroll, just keyboard padding.
export function KeyboardSpacer() {
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setKbHeight(e.endCoordinates?.height || 0);
    const onHide = () => setKbHeight(0);
    const s = Keyboard.addListener(showEvent, onShow);
    const h = Keyboard.addListener(hideEvent, onHide);
    return () => { s.remove(); h.remove(); };
  }, []);
  return <View style={{ height: kbHeight }} />;
}

// Re-exported for callers that want raw style sheet to avoid extra View nesting.
export const _styles = StyleSheet.create({});
