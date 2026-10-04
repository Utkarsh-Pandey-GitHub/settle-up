import React, { useEffect, useRef, useState } from "react";

import {
  Pressable,
  Image,
  View,
  TextInput,
  type TextInputProps,
  AccessibilityInfo,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Text, YStack, XStack } from "tamagui";
import Svg, { Path, Circle, Rect, Ellipse, G } from "react-native-svg";
import { useSession } from "../data/session";
import { bodyFont } from "../theme/config";
export const useColors = () =>
  useSession((s) => s.dark)
    ? {
        bg: "#1C1922",
        card: "#26212E",
        text: "#F6F3FB",
        muted: "#BAB2C6",
        line: "#40374C",
        soft: "#342B43",
        mint: "#392E4D",
        peach: "#302839",
        blue: "#322A40",
        butter: "#302839",
        primary: "#C4B3EB",
        onPrimary: "#221A32",
        accent: "#C4B3EB",
      }
    : {
        bg: "#F5F4F7",
        card: "#FFFFFF",
        text: "#211D29",
        muted: "#716B7B",
        line: "#E1DDE7",
        soft: "#F0ECF8",
        mint: "#E7DEF7",
        peach: "#F2EEF9",
        blue: "#FFFFFF",
        butter: "#FFFFFF",
        primary: "#6652A3",
        onPrimary: "#FFFFFF",
        accent: "#6652A3",
      };
export type IconName =
  | "camera"
  | "image"
  | "home"
  | "activity"
  | "transactions"
  | "plus"
  | "chart"
  | "groups"
  | "goal"
  | "scan"
  | "sms"
  | "settings"
  | "bell"
  | "arrow"
  | "back"
  | "down"
  | "up"
  | "check"
  | "close"
  | "search"
  | "wallet"
  | "coffee"
  | "car"
  | "bag"
  | "plane"
  | "bolt"
  | "chevron"
  | "logout"
  | "link"
  | "lock"
  | "calendar"
  | "moon"
  | "sun"
  | "download"
  | "more"
  | "edit"
  | "trash"
  | "help";
const paths: Record<string, string> = {
  camera: "M3 6h5l2-3h4l2 3h5v15H3Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  image: "M3 3h18v18H3Z M3 17l6-6 4 4 3-3 5 5 M8 7h.01",
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  transactions: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  plus: "M12 5v14 M5 12h14",
  chart: "M4 20V11 M10 20V4 M16 20v-7 M22 20V8",
  groups:
    "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M17 4a4 4 0 0 1 0 8 M21 21v-2a4 4 0 0 0-3-3.9",
  goal: "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l9-9 M17 3h4v4",
  scan: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 7h3v3H7z M14 7h3v3h-3z M7 14h3v3H7z M14 14h3v3h-3z",
  sms: "M4 4h16v13H8l-4 4Z M8 8h8 M8 12h5",
  settings:
    "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.2 2.2 M16.2 16.2l2.2 2.2 M5.6 18.4l2.2-2.2 M16.2 7.8l2.2-2.2",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  back: "M19 12H5 M10 7l-5 5 5 5",
  down: "M7 7l10 10 M7 17h10V7",
  up: "M7 17 17 7 M7 7h10v10",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12 M6 18 18 6",
  search: "M21 21l-5-5",
  wallet: "M3 6h17v15H3z M3 6V3h14v3 M16 11h5v5h-5z",
  coffee:
    "M4 7h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z M16 8h2a3 3 0 0 1 0 6h-2 M7 2v2 M12 2v2 M3 22h15",
  car: "M3 11l3-7h12l3 7v8H3Z M3 11h18 M6 15h2 M16 15h2 M6 19v2 M18 19v2",
  bag: "M4 7h16l1 14H3Z M8 8V6a4 4 0 0 1 8 0v2",
  plane: "m3 10 7 2 5 9 2-1-2-8 6-6c2-2 0-4-2-2l-6 6-8-2Z",
  bolt: "m13 2-9 12h7l-1 8 10-13h-7Z",
  chevron: "m9 5 7 7-7 7",
  logout: "M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4",
  link: "m10 13 4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  lock: "M5 10h14v11H5Z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  calendar: "M3 5h18v16H3Z M3 10h18 M7 2v6 M17 2v6",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z",
  sun: "M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4",
  trash: "M4 7h16 M9 7V4h6v3 M7 7l1 14h8l1-14 M10 11v6 M14 11v6",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01",
};
export function Icon({
  name,
  size = 22,
  color = "#7C7885",
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name] ?? paths.activity} />
      {name === "groups" && <Circle cx="9.5" cy="7" r="4" />}
      {name === "settings" && <Circle cx="12" cy="12" r="5" />}
      {name === "search" && <Circle cx="10" cy="10" r="7" />}
      {(name === "sun" || name === "help") && (
        <Circle cx="12" cy="12" r={name === "help" ? 10 : 5} />
      )}
    </Svg>
  );
}
export function Label({
  children,
  muted,
  size = 14,
  bold,
  color,
  ...props
}: React.ComponentProps<typeof Text> & {
  muted?: boolean;
  size?: number;
  bold?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      fontFamily="$body"
      fontWeight={bold ? "700" : "400"}
      fontSize={size}
      lineHeight={size * 1.4}
      color={color ?? (muted ? c.muted : c.text)}
      {...props}
    >
      {children}
    </Text>
  );
}
export function Heading({
  children,
  size = 26,
  textAlign = "left",
}: {
  children: React.ReactNode;
  size?: number;
  textAlign?: "left" | "center" | "right";
}) {
  return (
    <Label
      size={size}
      bold
      fontFamily="$heading"
      lineHeight={size * 1.18}
      letterSpacing={-0.35}
      accessibilityRole="header"
      textAlign={textAlign}
    >
      {children}
    </Label>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderWidth: 0,
          borderColor: c.line,
          borderRadius: 16,
          padding: width < 360 ? 13 : 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Skeleton({
  height,
  width = "100%",
  radius = 18,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={{
        height,
        width,
        borderRadius: radius,
        backgroundColor: c.line,
        opacity,
      }}
    />
  );
}
export function Button({
  children,
  onPress,
  secondary,
  icon,
  leading,
  disabled,
  compact,
  loading,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  secondary?: boolean;
  icon?: IconName;
  leading?: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!unavailable, busy: !!loading }}
      aria-disabled={!!unavailable}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          minWidth: 0,
          paddingHorizontal: compact
            ? width < 360
              ? 10
              : 14
            : width < 360
              ? 14
              : 20,
          paddingVertical: 11,
          borderRadius: 15,
          borderBottomWidth: 1,
          backgroundColor: secondary ? c.card : c.primary,
          borderWidth: 1,
          borderColor: secondary ? c.text : c.primary,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          opacity: unavailable ? 0.6 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={secondary ? c.text : c.onPrimary}
        />
      ) : leading ? (
        leading
      ) : !!icon ? (
        <Icon name={icon} size={20} color={secondary ? c.text : c.onPrimary} />
      ) : null}
      <Label
        bold
        size={width < 360 ? 14 : 15}
        color={secondary ? c.text : c.onPrimary}
        flexShrink={1}
        textAlign="center"
      >
        {children}
      </Label>
    </Pressable>
  );
}
export function IconButton({
  name,
  onPress,
  label,
  borderless = false,
}: {
  name: IconName;
  onPress(): void;
  label: string;
  borderless?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borderless ? 0 : 1,
        borderColor: borderless ? "transparent" : c.line,
        borderRadius: 13,
        backgroundColor: pressed ? c.soft : "transparent",
      })}
    >
      <Icon name={name} color={c.text} />
    </Pressable>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const c = useColors();
  return (
    <YStack gap={7}>
      <Label bold size={13}>
        {label}
      </Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            minHeight: 49,
            borderWidth: 1,
            borderColor: error ? "#B42332" : c.muted,
            borderRadius: 10,
            padding: 13,
            color: c.text,
            backgroundColor: c.card,
            fontFamily: bodyFont,
            fontSize: 15,
          },
          props.style,
        ]}
      />
      {!!error && (
        <Label color="#B42332" size={12}>
          {error}
        </Label>
      )}
    </YStack>
  );
}
export function Chip({
  children,
  selected,
  onPress,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress?(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-pressed={!!selected}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: c.text,
        backgroundColor: selected ? c.primary : c.card,
        borderRadius: 12,
        justifyContent: "center",
      }}
    >
      <Label size={13} color={selected ? c.onPrimary : c.text} bold={selected}>
        {children}
      </Label>
    </Pressable>
  );
}
export function Progress({
  value,
  color = "#6652A3",
}: {
  value: number;
  color?: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.max(0, Math.min(100, value)),
      }}
      style={{
        height: 8,
        backgroundColor: c.line,
        borderRadius: 5,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: 8,
          backgroundColor: color,
          borderRadius: 5,
        }}
      />
    </View>
  );
}

export const avatarPresets = [
  { id: "flower", label: "Flower", bg: "#FFF0F4", ink: "#C15C7A" },
  { id: "cat", label: "Cat", bg: "#FFF3DE", ink: "#9A653A" },
  { id: "fox", label: "Fox", bg: "#FFE9DE", ink: "#B75B3D" },
  { id: "bear", label: "Bear", bg: "#F5E8DE", ink: "#765445" },
  { id: "bunny", label: "Bunny", bg: "#F4ECFA", ink: "#74578A" },
  { id: "panda", label: "Panda", bg: "#EEF0F3", ink: "#34343A" },
  { id: "owl", label: "Owl", bg: "#E8F2FF", ink: "#516985" },
  { id: "dog", label: "Dog", bg: "#FFF1D8", ink: "#8D603C" },
  { id: "man", label: "Man", bg: "#E4F1F4", ink: "#416A75" },
  { id: "boy", label: "Boy", bg: "#E9EEFF", ink: "#53669A" },
  { id: "lady", label: "Lady", bg: "#FBE8F0", ink: "#95526E" },
  { id: "girl", label: "Girl", bg: "#FFF0E6", ink: "#9E6251" },
  { id: "astronaut", label: "Astronaut", bg: "#EAE8FF", ink: "#655D9B" },
  { id: "artist", label: "Artist", bg: "#FFF0EA", ink: "#A05457" },
  { id: "reader", label: "Reader", bg: "#E8F3EE", ink: "#4F7463" },
  { id: "cyclist", label: "Cyclist", bg: "#EAF4FF", ink: "#4E7191" },
  { id: "sun", label: "Sun", bg: "#FFF4CF", ink: "#A5751D" },
  { id: "moon", label: "Moon", bg: "#ECEBFF", ink: "#5B5E98" },
  { id: "leaf", label: "Leaf", bg: "#E5F3E7", ink: "#4E7857" },
  { id: "cloud", label: "Cloud", bg: "#E8F5FA", ink: "#547586" },
] as const;

function SketchAvatar({ preset, size }: { preset: string; size: number }) {
  const id = preset.replace(/^preset:/, "");
  const item =
    avatarPresets.find((entry) => entry.id === id) ?? avatarPresets[0];
  const stroke = item.ink;
  const common = {
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const face = (
    <>
      <Circle
        cx="16"
        cy="17"
        r="8.4"
        fill="#FFF9F5"
        stroke={stroke}
        strokeWidth="1.8"
      />
      <Path d="M13 17h.1 M19 17h.1 M14 21c1.2.8 2.8.8 4 0" {...common} />
    </>
  );
  let drawing: React.ReactNode;
  if (["cat", "fox", "bear", "bunny", "panda", "owl", "dog"].includes(id)) {
    drawing = (
      <>
        {id === "bunny" ? (
          <>
            <Ellipse
              cx="12"
              cy="7"
              rx="3"
              ry="6"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
            <Ellipse
              cx="20"
              cy="7"
              rx="3"
              ry="6"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
          </>
        ) : id === "bear" || id === "panda" ? (
          <>
            <Circle
              cx="10"
              cy="10"
              r="3.5"
              fill={id === "panda" ? stroke : "#FFF9F5"}
              stroke={stroke}
              strokeWidth="1.8"
            />
            <Circle
              cx="22"
              cy="10"
              r="3.5"
              fill={id === "panda" ? stroke : "#FFF9F5"}
              stroke={stroke}
              strokeWidth="1.8"
            />
          </>
        ) : id === "dog" ? (
          <>
            <Path
              d="M9 10 5 8l1 9 4-2"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
            <Path
              d="m23 10 4-2-1 9-4-2"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
          </>
        ) : (
          <>
            <Path
              d="m9 12 1-7 6 5"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
            <Path
              d="m23 12-1-7-6 5"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.8"
            />
          </>
        )}
        <Circle
          cx="16"
          cy="17"
          r="9"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        {id === "owl" ? (
          <>
            <Circle cx="12.5" cy="16" r="3.3" {...common} />
            <Circle cx="19.5" cy="16" r="3.3" {...common} />
            <Path d="m16 17-1 2h2z M11 23c3 2 7 2 10 0" {...common} />
          </>
        ) : (
          <>
            <Path
              d="M12.5 16h.1 M19.5 16h.1 M16 18l-1.2 1.2L16 20l1.2-.8z"
              {...common}
            />
            <Path d="M13 22c2 1 4 1 6 0" {...common} />
          </>
        )}
        {id === "panda" && (
          <>
            <Ellipse cx="12" cy="16" rx="2.2" ry="3" fill={stroke} />
            <Ellipse cx="20" cy="16" rx="2.2" ry="3" fill={stroke} />
          </>
        )}
      </>
    );
  } else if (
    [
      "man",
      "boy",
      "lady",
      "girl",
      "artist",
      "reader",
      "cyclist",
      "astronaut",
    ].includes(id)
  ) {
    drawing = (
      <>
        {id === "astronaut" && (
          <Circle
            cx="16"
            cy="16"
            r="13"
            fill="#FFF9F5"
            stroke={stroke}
            strokeWidth="1.8"
          />
        )}
        {face}
        {id === "man" && (
          <Path
            d="M8 15c1-7 5-10 11-8 3 1 5 4 5 8-4-2-8-5-11-1z"
            fill={stroke}
            opacity=".9"
          />
        )}
        {id === "boy" && (
          <Path
            d="M8 14c2-7 11-9 16-3l-6-1-3 3-3-2z"
            fill={stroke}
            opacity=".9"
          />
        )}
        {(id === "lady" || id === "girl") && (
          <Path
            d="M8 18C6 9 11 5 16 5s10 4 8 13l-4-7-4 2-4-2z"
            fill={stroke}
            opacity=".86"
          />
        )}
        {id === "artist" && (
          <>
            <Path d="M8 11c2-6 13-8 17 1-6-2-11-2-17-1z" fill={stroke} />
            <Path d="M10 7c3-3 9-4 12-1" {...common} />
          </>
        )}
        {id === "reader" && (
          <>
            <Path
              d="M8 16h7v6H8z M17 16h7v6h-7z"
              fill="#FFF9F5"
              stroke={stroke}
              strokeWidth="1.6"
            />
            <Path d="M15 17h2" {...common} />
          </>
        )}
        {id === "cyclist" && (
          <Path d="M8 12c3-6 12-7 17 0l-9-2z" fill={stroke} />
        )}
        {id === "astronaut" && (
          <>
            <Path d="M9 23c4 3 10 3 14 0" {...common} />
            <Circle cx="23" cy="8" r="1.2" fill={stroke} />
          </>
        )}
        <Path
          d="M8 30c1-5 5-7 8-7s7 2 8 7"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
      </>
    );
  } else if (id === "flower") {
    drawing = (
      <>
        <Circle
          cx="16"
          cy="16"
          r="4"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        {[
          [16, 8],
          [24, 16],
          [16, 24],
          [8, 16],
          [10.5, 10.5],
          [21.5, 10.5],
          [21.5, 21.5],
          [10.5, 21.5],
        ].map(([cx, cy]) => (
          <Ellipse
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            rx="3"
            ry="5"
            fill="#FFF9F5"
            stroke={stroke}
            strokeWidth="1.4"
            transform={`rotate(${(Math.atan2(cy - 16, cx - 16) * 180) / Math.PI + 90} ${cx} ${cy})`}
          />
        ))}
      </>
    );
  } else if (id === "sun") {
    drawing = (
      <>
        <Circle
          cx="16"
          cy="16"
          r="7"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <Path
          d="M16 3v4 M16 25v4 M3 16h4 M25 16h4 M7 7l3 3 M22 22l3 3 M25 7l-3 3 M10 22l-3 3 M13 16h.1 M19 16h.1 M13 20c2 1 4 1 6 0"
          {...common}
        />
      </>
    );
  } else if (id === "moon") {
    drawing = (
      <>
        <Path
          d="M22 5c-8 1-12 8-9 15 2 5 7 7 12 5-3 4-9 5-14 2C4 23 3 13 9 7c4-4 9-4 13-2z"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <Path d="M12 16h.1 M16 19c1 .6 2 .6 3 0" {...common} />
      </>
    );
  } else if (id === "leaf") {
    drawing = (
      <>
        <Path
          d="M25 6C14 6 7 12 8 23c9 2 16-4 17-17z"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <Path d="M7 27c4-7 9-11 15-16 M13 20l-1-6 M17 16l5 1" {...common} />
      </>
    );
  } else {
    drawing = (
      <>
        <Path
          d="M8 23h16a5 5 0 0 0 0-10 8 8 0 0 0-15-1 5.5 5.5 0 0 0-1 11z"
          fill="#FFF9F5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <Path d="M12 17h.1 M19 17h.1 M13 20c2 1 4 1 6 0" {...common} />
      </>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: item.bg,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Svg width={size * 0.86} height={size * 0.86} viewBox="0 0 32 32">
        {drawing}
      </Svg>
    </View>
  );
}

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const c = useColors();
  return (
    <YStack gap={8}>
      <Label bold size={13}>
        Choose your avatar
      </Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {avatarPresets.map((item) => {
          const preset = `preset:${item.id}`;
          const selected = value === preset;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(preset)}
              style={{
                width: "18%",
                minWidth: 48,
                alignItems: "center",
                paddingVertical: 4,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: selected ? c.accent : "transparent",
              }}
            >
              <SketchAvatar preset={preset} size={44} />
            </Pressable>
          );
        })}
      </View>
    </YStack>
  );
}

export function Avatar({
  name,
  size = 36,
  color = "#EEE8F8",
  avatar,
}: {
  name: string;
  size?: number;
  color?: string;
  avatar?: string;
}) {
  if (avatar?.startsWith("preset:"))
    return <SketchAvatar preset={avatar} size={size} />;
  if (avatar?.startsWith("https://"))
    return (
      <Image
        source={{ uri: avatar }}
        accessibilityLabel={`${name}'s profile picture`}
        style={{ width: size, height: size, borderRadius: size / 2.6 }}
      />
    );
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: size / 2.5,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#FFFFFF",
      }}
    >
      <Label size={size * 0.32} bold color="#493865">
        {name
          .split(" ")
          .map((s) => s[0])
          .slice(0, 2)
          .join("")}
      </Label>
    </View>
  );
}
export function Notice({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        padding: 15,
        backgroundColor: error ? "#FFF0F0" : c.soft,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Mascot size={44} mood={error ? "help" : "wave"} animate={false} />
      <Label flex={1} size={13} color={error ? "#A12435" : c.text}>
        {children}
      </Label>
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
  onPress,
}: {
  title: string;
  detail: string;
  action?: string;
  onPress?(): void;
}) {
  return (
    <XStack
      alignItems="center"
      paddingVertical={12}
      gap={12}
      maxWidth={520}
      width="100%"
      alignSelf="center"
    >
      <Mascot size={76} />
      <YStack flex={1} gap={8} alignItems="flex-start">
        <Heading size={20}>{title}</Heading>
        <Label muted size={13}>
          {detail}
        </Label>
        {!!action && (
          <Button compact onPress={onPress}>
            {action}
          </Button>
        )}
      </YStack>
    </XStack>
  );
}
export type PipMood = "wave" | "reading" | "success" | "help";
export function PipFeedback({
  mood,
  message,
}: {
  mood: PipMood;
  message: string;
}) {
  return (
    <XStack gap={10} alignItems="center" accessibilityLiveRegion="polite">
      <Mascot size={76} mood={mood} />
      <Label bold size={13} flex={1} lineHeight={20}>
        {message}
      </Label>
    </XStack>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <XStack
      gap={8}
      alignItems="center"
      accessible
      accessibilityLabel="SettleUp"
    >
      <Mascot size={compact ? 32 : 40} mark animate={false} />
      <Label bold size={compact ? 20 : 24} letterSpacing={-1}>
        settle
        <Label bold size={compact ? 20 : 24} color="#6652A3">
          up.
        </Label>
      </Label>
    </XStack>
  );
}
export const Mascot = React.memo(function Mascot({
  size = 170,
  mood = "wave",
  mark = false,
  animate = true,
}: {
  size?: number;
  mood?: PipMood;
  mark?: boolean;
  animate?: boolean;
}) {
  const motion = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    if (!animate || mark) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReducedMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [animate, mark]);
  useEffect(() => {
    motion.setValue(0);
    if (!animate || mark || reducedMotion) return;
    const animation = Animated.sequence([
      Animated.timing(motion, {
        toValue: 1,
        duration: 240,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(motion, {
        toValue: 0,
        friction: 3,
        tension: 90,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [animate, mark, mood, motion, reducedMotion]);
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0, mood === "success" ? -10 : -4],
            }),
          },
          {
            rotate: motion.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", mood === "help" ? "-5deg" : "5deg"],
            }),
          },
        ],
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={mark ? "36 8 134 150" : "0 0 200 200"}
      >
        {!mark && (
          <Ellipse
            cx="109"
            cy="175"
            rx="60"
            ry="10"
            fill="#D9CEE8"
            opacity="0.55"
          />
        )}
        <G rotation={mark ? 0 : -9} origin="100,100">
          {!mark && (
            <Path
              d="M55 140 41 160M142 140l14 23"
              stroke="#502A9C"
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          {!mark && (
            <Path
              d={
                mood === "success"
                  ? "M50 105 26 63M154 97l20-42"
                  : mood === "reading"
                    ? "M50 105 70 135M154 97l-19 38"
                    : mood === "help"
                      ? "M50 105 27 105M154 97l19 8"
                      : "M50 105 27 90M154 97l19-19"
              }
              stroke="#7B51D0"
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          <Rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
          <Path
            d="M58 60q30-24 80-4"
            fill="none"
            stroke="#C1A0F0"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <Ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
          <Ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
          <Circle cx="85" cy="91" r="2" fill="#FFF" />
          <Circle cx="127" cy="91" r="2" fill="#FFF" />
          <Path
            d={
              mood === "help"
                ? "M92 117q12-5 24 0"
                : mood === "success"
                  ? "M90 112q14 23 28-2"
                  : "M92 113q12 15 24-1"
            }
            stroke="#38255E"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
          <Ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
          <G rotation="10" origin="111,31">
            <Rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
            <Path
              d="m104 26 5 7 10-8"
              stroke="#9A651E"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
          {!mark && mood === "reading" && (
            <G>
              <Rect
                x="65"
                y="125"
                width="80"
                height="48"
                rx="6"
                fill="#FFF"
                stroke="#7C52BF"
                strokeWidth="3"
              />
              <Path
                d="M78 137h52 M78 148h34 M78 159h44"
                stroke="#A080D0"
                strokeWidth="3"
              />
            </G>
          )}
          {!mark && mood === "success" && (
            <G fill="#A78BFA">
              <Path d="m18 45 7 5-5 7-7-5Z M164 14l8 5-5 8-8-5Z" />
              <Circle cx="183" cy="100" r="5" />
            </G>
          )}
        </G>
        {!mark && (
          <Path d="m174 32 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#B090DE" />
        )}
        {!mark && <Circle cx="28" cy="44" r="4" fill="#F3BA69" />}
      </Svg>
    </Animated.View>
  );
});

const referenceArt = {
  coins: require("../../assets/finance/coins.png"),
  wallet: require("../../assets/finance/wallet.png"),
  privacy: require("../../assets/finance/privacy.png"),
};
export function ReferenceArt({
  scene,
  size = 180,
}: {
  scene: keyof typeof referenceArt;
  size?: number;
}) {
  return (
    <Image
      source={referenceArt[scene]}
      accessibilityLabel={
        scene === "coins"
          ? "Illustrated stack of savings coins"
          : scene === "wallet"
            ? "Illustration of a wallet and mobile phone"
            : "Illustration of private, protected finances"
      }
      resizeMode="contain"
      style={{ width: size, height: size * 0.85 }}
    />
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.muted,
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 46,
        gap: 8,
      }}
    >
      <Icon name="search" size={22} color={c.text} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        value={value}
        onChangeText={onChangeText}
        style={{
          flex: 1,
          fontSize: 14,
          color: c.text,
          paddingVertical: 0,
        }}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText("")} style={{ padding: 4 }}>
          <Icon name="close" size={14} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

export function SearchPicker({
  visible,
  title,
  options,
  selected,
  multiple = false,
  onSelect,
  onClose,
  placeholder,
  onClear,
  selectionIcon = "chevron",
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string; detail?: string }[];
  selected: string[];
  multiple?: boolean;
  onSelect(id: string): void;
  onClose(): void;
  placeholder?: string;
  onClear?(): void;
  selectionIcon?: IconName;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);
  const filtered = options.filter((option) =>
    `${option.label} ${option.detail ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: width < 360 ? 10 : 20,
          backgroundColor: "rgba(22, 24, 28, 0.48)",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 520,
            maxHeight: Math.max(280, height - (height < 650 ? 28 : 64)),
            padding: width < 360 ? 14 : 20,
            gap: 14,
            borderRadius: 24,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
          }}
        >
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <Heading size={20}>{title}</Heading>
            <IconButton name="close" label="Close" onPress={onClose} />
          </XStack>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={placeholder ?? `Search ${title.toLocaleLowerCase()}…`}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 8 }}
          >
            {filtered.map((option) => {
              const active = selected.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole={multiple ? "checkbox" : "radio"}
                  accessibilityState={{
                    checked: active,
                    selected: active,
                  }}
                  onPress={() => {
                    onSelect(option.id);
                    if (!multiple) onClose();
                  }}
                  style={{
                    minHeight: 54,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? "#6652A3" : c.line,
                    backgroundColor: active ? c.soft : c.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <YStack flex={1} gap={2}>
                    <Label bold size={13}>
                      {option.label}
                    </Label>
                    {!!option.detail && (
                      <Label muted size={11}>
                        {option.detail}
                      </Label>
                    )}
                  </YStack>
                  <Icon
                    name={active ? "check" : selectionIcon}
                    size={18}
                    color={active ? c.accent : c.muted}
                  />
                </Pressable>
              );
            })}
            {!filtered.length && (
              <Label muted size={12} style={{ paddingVertical: 22 }}>
                No matches found.
              </Label>
            )}
          </ScrollView>
          {multiple && (
            <XStack gap={8} flexWrap="wrap">
              {!!selected.length && !!onClear && (
                <Button secondary compact onPress={onClear}>
                  Deselect all
                </Button>
              )}
              <View style={{ flex: 1 }} />
              <Button onPress={onClose}>Done</Button>
            </XStack>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type DialogAction = {
  label: string;
  onPress(): void;
  destructive?: boolean;
  secondary?: boolean;
  loading?: boolean;
};

export function ActionDialog({
  visible,
  title,
  detail,
  icon = "wallet",
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  detail: string;
  icon?: IconName;
  actions: DialogAction[];
  onClose(): void;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: width < 360 ? 10 : 20,
          backgroundColor: "rgba(22,24,28,0.58)",
        }}
      >
        <Pressable
          accessibilityRole="alert"
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 460,
            maxHeight: Math.max(260, height - 32),
            borderRadius: 26,
            padding: width < 360 ? 14 : 20,
            gap: 16,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            shadowColor: "#25202E",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 14,
          }}
        >
          <XStack gap={13} alignItems="flex-start">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.soft,
              }}
            >
              <Icon name={icon} size={22} color={c.text} />
            </View>
            <YStack flex={1} gap={5} paddingTop={1}>
              <Heading size={19}>{title}</Heading>
              <Label muted size={12} lineHeight={18}>
                {detail}
              </Label>
            </YStack>
            <IconButton name="close" label="Close" onPress={onClose} />
          </XStack>
          <XStack gap={8} flexWrap="wrap" justifyContent="flex-end">
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityState={{ busy: !!action.loading }}
                disabled={action.loading}
                onPress={action.onPress}
                style={({ pressed }) => ({
                  minHeight: 44,
                  minWidth: width < 360 ? "100%" : 96,
                  flexGrow: width < 360 ? 1 : 0,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: action.destructive
                    ? "#B65B68"
                    : action.secondary
                      ? c.line
                      : c.primary,
                  backgroundColor: action.destructive
                    ? "#A74757"
                    : action.secondary
                      ? c.card
                      : c.primary,
                  opacity: action.loading ? 0.6 : pressed ? 0.82 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                {action.loading ? (
                  <ActivityIndicator
                    size="small"
                    color={action.secondary ? c.text : "#FFFFFF"}
                  />
                ) : (
                  <Label
                    bold
                    size={13}
                    color={action.secondary ? c.text : "#FFFFFF"}
                  >
                    {action.label}
                  </Label>
                )}
              </Pressable>
            ))}
          </XStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function FilterDropdownTrigger({
  label,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexGrow: 1,
        flexBasis: compact ? 0 : 128,
        minWidth: compact ? 0 : undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: active ? c.primary : c.card,
        borderWidth: 1,
        borderColor: c.text,
        borderRadius: 12,
        paddingHorizontal: compact ? 8 : 10,
        height: 44,
      }}
    >
      <Label
        size={compact ? 12 : 13}
        flex={1}
        minWidth={0}
        marginRight={4}
        bold
        color={active ? c.onPrimary : c.text}
        numberOfLines={1}
      >
        {label}
      </Label>
      <Icon name="down" size={14} color={active ? c.onPrimary : c.text} />
    </Pressable>
  );
}

export function FilterDropdownPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 10,
        gap: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      <Label size={11} muted bold style={{ marginBottom: 2, paddingLeft: 4 }}>
        {title}
      </Label>
      <XStack flexWrap="wrap" gap={6}>
        {children}
      </XStack>
    </View>
  );
}
