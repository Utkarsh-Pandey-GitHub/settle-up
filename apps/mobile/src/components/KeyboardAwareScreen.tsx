import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type ScrollViewProps,
} from "react-native";

const FocusContext = createContext<((field: TextInput) => void) | null>(null);

export function useKeyboardAwareField() {
  const reveal = useContext(FocusContext);
  const ref = useRef<TextInput>(null);
  return {
    ref,
    onFocus: () => {
      if (ref.current) reveal?.(ref.current);
    },
  };
}

type KeyboardAwareScreenProps = ScrollViewProps & {
  children: React.ReactNode;
  keyboardOffset?: number;
  focusedFieldOffset?: number;
};

export function KeyboardAwareScreen({
  children,
  keyboardOffset = 0,
  focusedFieldOffset = 24,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  onLayout,
  onScroll,
  onContentSizeChange,
  contentContainerStyle,
  ...scrollProps
}: KeyboardAwareScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const focused = useRef<TextInput | null>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef(Keyboard.metrics()?.screenY);
  const frame = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);

  const reveal = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const scroll = scrollRef.current;
      const input = focused.current;
      const top = keyboardTop.current;
      if (!scroll || !input?.isFocused() || top === undefined) return;
      scroll
        .getNativeScrollRef()
        ?.measureInWindow((_x, viewTop, _width, height) => {
          if (height <= 0 || keyboardTop.current !== top) return;
          const viewBottom = viewTop + height;
          const visibleBottom = Math.min(viewBottom, top);
          setOverlap(
            Platform.OS === "ios"
              ? 0
              : Math.max(0, Math.ceil(viewBottom - top)),
          );
          input.measureInWindow(
            (_fieldX, fieldTop, _fieldWidth, fieldHeight) => {
              if (!input.isFocused() || keyboardTop.current !== top) return;
              const maxVisibleHeight = Math.max(
                1,
                visibleBottom - viewTop - focusedFieldOffset,
              );
              const fieldBottom =
                fieldTop + Math.min(fieldHeight, maxVisibleHeight);
              const delta =
                fieldTop < viewTop
                  ? fieldTop - viewTop - focusedFieldOffset
                  : Math.max(
                      0,
                      fieldBottom - visibleBottom + focusedFieldOffset,
                    );
              if (Math.abs(delta) > 1)
                scroll.scrollTo({
                  y: Math.max(0, scrollY.current + delta),
                  animated: false,
                });
            },
          );
        });
    });
  }, [focusedFieldOffset]);

  const focus = useCallback(
    (input: TextInput) => {
      focused.current = input;
      keyboardTop.current = Keyboard.metrics()?.screenY ?? keyboardTop.current;
      reveal();
    },
    [reveal],
  );

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      reveal();
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = undefined;
      setOverlap(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [reveal]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        onLayout={(event) => {
          onLayout?.(event);
          reveal();
        }}
        onContentSizeChange={(width, height) => {
          onContentSizeChange?.(width, height);
          reveal();
        }}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
      >
        <FocusContext.Provider value={focus}>{children}</FocusContext.Provider>
        {overlap > 0 && (
          <View style={{ height: overlap + focusedFieldOffset }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
