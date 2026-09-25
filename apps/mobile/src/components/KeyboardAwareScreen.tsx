import React, { useEffect, useRef } from "react";
import {
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type TargetedEvent,
} from "react-native";

type KeyboardAwareScreenProps = ScrollViewProps & {
  children: React.ReactNode;
  keyboardOffset?: number;
  focusedFieldOffset?: number;
};

/**
 * Keeps the focused field visible while the software keyboard is open.
 * Use this instead of a page-level ScrollView whenever a screen contains
 * editable fields. It also gives modal forms the same keyboard behaviour.
 */
export function KeyboardAwareScreen({
  children,
  keyboardOffset = 0,
  focusedFieldOffset = 24,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  onFocus,
  ...scrollProps
}: KeyboardAwareScreenProps) {
  const scrollRef = useRef<ScrollView>(null);

  const revealHandle = (handle: number | null) => {
    if (handle == null) return;
    const responder = (
      scrollRef.current as ScrollView & {
        getScrollResponder?: () => {
          scrollResponderScrollNativeHandleToKeyboard?: (
            node: number,
            additionalOffset: number,
            preventNegativeScrollOffset: boolean,
          ) => void;
        };
      }
    )?.getScrollResponder?.();
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(
      handle,
      focusedFieldOffset,
      true,
    );
  };

  useEffect(() => {
    const revealFocusedField = () => {
      // Wait for the resized keyboard viewport before calculating the offset.
      requestAnimationFrame(() => {
        const state = TextInput.State as typeof TextInput.State & {
          currentlyFocusedInput?: () => unknown;
        };
        const focusedInput = state.currentlyFocusedInput?.();
        const handle = findNodeHandle(focusedInput as never);
        revealHandle(handle);
      });
    };
    const subscription = Keyboard.addListener(
      "keyboardDidShow",
      revealFocusedField,
    );
    return () => subscription.remove();
  }, [focusedFieldOffset]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        onFocus={(event: NativeSyntheticEvent<TargetedEvent>) => {
          onFocus?.(event);
          const handle = event.nativeEvent.target;
          setTimeout(() => revealHandle(handle), 80);
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
