import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  useWindowDimensions,
  Platform,
  ViewStyle,
  Keyboard,
  KeyboardEvent,
  BackHandler,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

const DISMISS_VELOCITY = 800;
const DISMISS_DISTANCE_RATIO = 0.25;
// On tablets / wide-screen phones in landscape, a full-width sheet looks
// stretched and awkward. Constrain to a comfortable reading width and center.
// Phone portrait (<= 600px wide) → full width. Anything wider → max 560px centered.
const SHEET_MAX_WIDTH = 560;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max height as fraction of screen (0..1). Default 0.82. */
  maxHeight?: number;
  /** Min height as fraction of screen (0..1). Prevents sheets with little content from appearing tiny. */
  minHeight?: number;
  /** Disable swipe-down to close (rarely needed — keep UX consistent). */
  swipeDownDisabled?: boolean;
  /** Custom sheet style (background, padding, etc.). */
  sheetStyle?: ViewStyle;
  /** If true, tapping overlay does NOT close. Default false. */
  overlayTapDisabled?: boolean;
};

/**
 * Unified bottom-sheet shell used across the app. Supports:
 *   - swipe-down to dismiss (pan gesture on the handle + sheet body)
 *   - tap-outside to dismiss
 *   - spring-in / timing-out animations
 * Behaves like iOS sheet presentation: grabber at top, rubber-band if over-dragged up.
 */
export default function SwipeableSheet({
  visible,
  onClose,
  children,
  maxHeight = 0.82,
  minHeight,
  swipeDownDisabled = false,
  sheetStyle,
  overlayTapDisabled = false,
}: Props) {
  // Use the hook variant so the sheet auto-reflows on device rotation
  // and on foldables; the static Dimensions.get('window') captured at
  // module load was wrong after rotation and produced tiny / clipped sheets.
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const IS_WIDE = SCREEN_WIDTH > 600;
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);
  const closingRef = useRef(false);
  const [kbHeight, setKbHeight] = useState(0);
  const insets = useSafeAreaInsets();
  // Add device safe-area bottom (home indicator / gesture bar) so buttons inside
  // the sheet are reachable on every device. Skip when keyboard is up — keyboard
  // already excludes the safe area, so adding it again would push content too high.
  const safeBottom = kbHeight > 0 ? 0 : insets.bottom;

  // Lift the sheet above the on-screen keyboard so inputs stay visible while typing.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setKbHeight(e.endCoordinates?.height || 0);
    const onHide = () => setKbHeight(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const sheetHeight = SCREEN_HEIGHT * maxHeight;
  const sheetMinHeight = minHeight != null ? SCREEN_HEIGHT * Math.min(minHeight, maxHeight) : undefined;
  // When the on-screen keyboard is visible, the sheet can't keep its full
  // `maxHeight` because the visible area shrunk. Constrain to the available
  // window so the top of the sheet never gets cropped (was clipping the title
  // + first input on smaller phones when keyboard came up).
  const effectiveMaxHeight = kbHeight > 0
    ? Math.max(SCREEN_HEIGHT * 0.4, SCREEN_HEIGHT - kbHeight - insets.top - 24)
    : sheetHeight;

  const closeSafely = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const animateClose = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (finished) => {
      if (finished) runOnJS(closeSafely)();
    });
    overlayOpacity.value = withTiming(0, { duration: 200 });
  }, [translateY, overlayOpacity, closeSafely]);

  // Android hardware-back: only the most recently shown visible sheet should consume the
  // event. RN's BackHandler runs handlers in LIFO order until one returns true, so adding
  // the listener on `visible` (and removing on hide) gives us the topmost-only behavior.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, animateClose]);

  // Open animation — runs whenever the sheet is asked to become visible.
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      translateY.value = SCREEN_HEIGHT;
      overlayOpacity.value = 0;
      translateY.value = withSpring(0, {
        damping: 22,
        stiffness: 260,
        mass: 0.6,
        overshootClamping: true,
      });
      overlayOpacity.value = withTiming(1, { duration: 240 });
    }
  }, [visible, translateY, overlayOpacity]);

  // Pan binds to the grabber zone only — wrapping the whole sheet conflicts with
  // scroll children (FlatList / ScrollView), which is why drag-to-dismiss felt
  // broken across the app. activeOffsetY([..., 6]) keeps small taps responsive.
  const pan = Gesture.Pan()
    .enabled(!swipeDownDisabled)
    .activeOffsetY([-15, 6])
    .onUpdate((e) => {
      if (e.translationY >= 0) {
        translateY.value = e.translationY;
        overlayOpacity.value = interpolate(
          e.translationY,
          [0, sheetHeight],
          [1, 0],
          Extrapolation.CLAMP,
        );
      } else {
        translateY.value = e.translationY * 0.05;
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > sheetHeight * DISMISS_DISTANCE_RATIO ||
        e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 200 },
          (finished) => {
            if (finished) runOnJS(closeSafely)();
          },
        );
        overlayOpacity.value = withTiming(0, { duration: 180 });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 260, mass: 0.6 });
        overlayOpacity.value = withTiming(1, { duration: 160 });
      }
    });

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={animateClose}
      statusBarTranslucent
    >
      <View
        style={[styles.root, { alignItems: IS_WIDE ? 'center' : 'stretch' }]}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback
          disabled={overlayTapDisabled}
          onPress={animateClose}
        >
          <Animated.View style={[styles.overlay, overlayAnimStyle]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            // Tablet / wide-screen styling: cap width and float with rounded corners.
            IS_WIDE && {
              borderBottomLeftRadius: 26,
              borderBottomRightRadius: 26,
              marginBottom: 16,
              width: '100%',
              maxWidth: SHEET_MAX_WIDTH,
            },
            { maxHeight: effectiveMaxHeight, minHeight: sheetMinHeight, marginBottom: (kbHeight || (IS_WIDE ? 16 : 0)), paddingBottom: 16 + safeBottom },
            sheetStyle,
            sheetAnimStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    // alignItems toggled inline based on the live IS_WIDE value.
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
    overflow: 'hidden',
  },
  handleArea: {
    // Tall hit area (was 24px → 56px) so users can drag-to-dismiss without
    // pixel-precise aim. The handle stays small and visible; the extra space
    // is invisible touch target, addressing the "البردة ما تنزل لتحت" UX
    // complaint where users tapped below the grabber and gesture didn't fire.
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
  },
  handle: {
    width: 56,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
});
