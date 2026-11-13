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
import Svg, {
  Path,
  Circle,
  Rect,
  Ellipse,
  G,
  Defs,
  Stop,
  LinearGradient,
  RadialGradient,
  ClipPath,
} from "react-native-svg";
import * as L from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Illustration } from "./illustrations";
import { useSession } from "../data/session";
import { useKeyboardAwareField } from "./KeyboardAwareScreen";
import { bodyFont, fonts } from "../theme/config";
// Calm, neutral surfaces with a single indigo accent. Green/red are reserved
// for money direction (owed to you / you owe).
export const palette = {
  light: {
    bg: "#F6F7F9",
    card: "#FFFFFF",
    text: "#0F172A",
    muted: "#64748B",
    line: "#E4E7EC",
    soft: "#F1F3F7",
    mint: "#ECFDF5",
    amber: "#FFFBEB",
    rose: "#FEF2F2",
    peach: "#F1F3F7",
    blue: "#FFFFFF",
    butter: "#FFFFFF",
    primary: "#4F46E5",
    onPrimary: "#FFFFFF",
    accent: "#4F46E5",
    accentSoft: "#EEF2FF",
    positive: "#047857",
    negative: "#B91C1C",
  },
  dark: {
    bg: "#0B0D12",
    card: "#151922",
    text: "#F1F5F9",
    muted: "#94A3B8",
    line: "#262B36",
    soft: "#1C212C",
    mint: "#0F2A22",
    amber: "#2A2214",
    rose: "#2C1517",
    peach: "#1C212C",
    blue: "#151922",
    butter: "#151922",
    primary: "#818CF8",
    onPrimary: "#0B0D12",
    accent: "#818CF8",
    accentSoft: "#1E2140",
    positive: "#34D399",
    negative: "#F87171",
  },
};
export const useColors = () =>
  useSession((s) => s.dark) ? palette.dark : palette.light;
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
  | "refresh"
  | "sync"
  | "filter"
  | "more"
  | "edit"
  | "trash"
  | "help";
const paths: Record<string, string> = {
  camera: "M3 6h5l2-3h4l2 3h5v15H3Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  image: "M3 3h18v18H3Z M3 17l6-6 4 4 3-3 5 5 M8 7h.01",
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  filter: "M4 6h16 M7 12h10 M10 18h4",
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
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5 9a8 8 0 0 1 13-4l2 3 M19 15a8 8 0 0 1-13 4l-2-3",
  sync: "M4 7h11l-3-3 M20 17H9l3 3 M15 4l3 3-3 3 M9 20l-3-3 3-3",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4",
  trash: "M4 7h16 M9 7V4h6v3 M7 7l1 14h8l1-14 M10 11v6 M14 11v6",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01",
};
const lucide: Record<IconName, LucideIcon> = {
  camera: L.Camera,
  image: L.Image,
  home: L.House,
  activity: L.Activity,
  filter: L.ListFilter,
  transactions: L.ReceiptText,
  plus: L.Plus,
  chart: L.ChartColumn,
  groups: L.Users,
  goal: L.Target,
  scan: L.ScanLine,
  sms: L.MessageSquareText,
  settings: L.Settings,
  bell: L.Bell,
  arrow: L.ArrowRight,
  back: L.ArrowLeft,
  down: L.ChevronDown,
  up: L.ChevronUp,
  check: L.Check,
  close: L.X,
  search: L.Search,
  wallet: L.Wallet,
  coffee: L.Coffee,
  car: L.Car,
  bag: L.ShoppingBag,
  plane: L.Plane,
  bolt: L.Sparkles,
  chevron: L.ChevronRight,
  logout: L.LogOut,
  link: L.Share2,
  lock: L.Lock,
  calendar: L.Calendar,
  moon: L.Moon,
  sun: L.Sun,
  download: L.Download,
  refresh: L.RefreshCw,
  sync: L.RefreshCcw,
  more: L.Ellipsis,
  edit: L.Pencil,
  trash: L.Trash2,
  help: L.CircleHelp,
};
export function Icon({
  name,
  size = 22,
  color = "#64748B",
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const Glyph = lucide[name] ?? L.Activity;
  return <Glyph size={size} color={color} strokeWidth={size <= 16 ? 2 : 1.75} />;
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
      fontFamily={(bold ? fonts.semibold : fonts.regular) as any}
      fontSize={size}
      lineHeight={size * 1.45}
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
  ...layout
}: Pick<
  React.ComponentProps<typeof Label>,
  "flex" | "flexShrink" | "minWidth"
> & {
  children: React.ReactNode;
  size?: number;
  textAlign?: "left" | "center" | "right";
}) {
  return (
    <Label
      size={size}
      bold
      fontFamily={fonts.semibold as any}
      lineHeight={size * 1.22}
      letterSpacing={size >= 22 ? -0.6 : -0.2}
      accessibilityRole="header"
      textAlign={textAlign}
      {...layout}
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
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          padding: width < 360 ? 14 : 18,
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
          minHeight: compact ? 40 : 48,
          minWidth: 0,
          paddingHorizontal: compact
            ? width < 360
              ? 10
              : 14
            : width < 360
              ? 14
              : 20,
          paddingVertical: 11,
          borderRadius: 12,
          backgroundColor: secondary ? c.card : c.primary,
          borderWidth: 1,
          borderColor: secondary ? c.line : c.primary,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: unavailable ? 0.5 : pressed ? 0.85 : 1,
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
        <Icon name={icon} size={18} color={secondary ? c.text : c.onPrimary} />
      ) : null}
      <Label
        bold
        size={compact ? 13 : width < 360 ? 14 : 15}
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
  disabled = false,
  size = 44,
  iconSize,
}: {
  name: IconName;
  onPress(): void;
  label: string;
  borderless?: boolean;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        opacity: disabled ? 0.5 : 1,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borderless ? 0 : 1,
        borderColor: borderless ? "transparent" : c.line,
        borderRadius: Math.max(9, size * 0.3),
        backgroundColor: pressed ? c.soft : "transparent",
      })}
    >
      <Icon
        name={name}
        size={iconSize ?? Math.min(22, size * 0.5)}
        color={c.text}
      />
    </Pressable>
  );
}
export function Field({
  label,
  error,
  onFocus,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const c = useColors();
  const keyboardField = useKeyboardAwareField();
  return (
    <YStack gap={7}>
      <Label size={13} color={c.muted}>
        {label}
      </Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        ref={keyboardField.ref}
        onFocus={(event) => {
          keyboardField.onFocus();
          onFocus?.(event);
        }}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? c.negative : c.line,
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
        maxWidth: "100%",
        flexShrink: 1,
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.line,
        backgroundColor: selected ? c.accentSoft : c.card,
        borderRadius: 999,
        justifyContent: "center",
      }}
    >
      <Label size={13} color={selected ? c.accent : c.text} bold={selected}>
        {children}
      </Label>
    </Pressable>
  );
}
export function Progress({
  value,
  color = "#4F46E5",
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
        height: 6,
        backgroundColor: c.soft,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: 6,
          backgroundColor: color,
          borderRadius: 3,
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

type PersonSpec = {
  skin: string;
  hair: string;
  shirt: string;
  style: "short" | "crop" | "long" | "bun" | "curly";
  extra?: "helmet" | "beret" | "glasses" | "cap";
};
const people: Record<string, PersonSpec> = {
  man: { skin: "#E0AC8A", hair: "#3B2A20", shirt: "#3F6E7A", style: "short" },
  boy: { skin: "#F1C6A5", hair: "#5A3A22", shirt: "#4F66B0", style: "crop", extra: "cap" },
  lady: { skin: "#C98E6B", hair: "#2B1B16", shirt: "#B0577A", style: "long" },
  girl: { skin: "#F3CDB0", hair: "#8A4B2A", shirt: "#E07A5F", style: "bun" },
  astronaut: { skin: "#D9A07E", hair: "#2E2A33", shirt: "#E5E7EB", style: "short", extra: "helmet" },
  artist: { skin: "#E8B693", hair: "#6B2E2E", shirt: "#C2554F", style: "curly", extra: "beret" },
  reader: { skin: "#B97E5A", hair: "#1F1A17", shirt: "#4F7463", style: "short", extra: "glasses" },
  cyclist: { skin: "#EDBE9C", hair: "#3D2B1F", shirt: "#3B82C4", style: "crop", extra: "helmet" },
};
type AnimalSpec = {
  fur: string;
  inner: string;
  ears: "pointy" | "round" | "long" | "tufts" | "floppy";
  muzzle?: string;
  patches?: string;
};
const animals: Record<string, AnimalSpec> = {
  cat: { fur: "#E3A35C", inner: "#F6C9A0", ears: "pointy", muzzle: "#FBE7D3" },
  fox: { fur: "#E07A3F", inner: "#FFFFFF", ears: "pointy", muzzle: "#FFF7EF" },
  bear: { fur: "#8B5E3C", inner: "#C89B76", ears: "round", muzzle: "#D9B99B" },
  bunny: { fur: "#EEE7F3", inner: "#F4B8C8", ears: "long", muzzle: "#FFFFFF" },
  panda: { fur: "#FFFFFF", inner: "#2E2E33", ears: "round", patches: "#2E2E33" },
  owl: { fur: "#8A6A4F", inner: "#E9D6BF", ears: "tufts", muzzle: "#F2C14E" },
  dog: { fur: "#C8955F", inner: "#7A5232", ears: "floppy", muzzle: "#F3E1C9" },
};
function PersonArt({ p, uid }: { p: PersonSpec; uid: string }) {
  return (
    <G>
      <Path d="M12 64c0-12 9-19 20-19s20 7 20 19Z" fill={p.shirt} />
      <Path d="M27 45h10v5a5 5 0 0 1-10 0Z" fill={p.skin} />
      <Path d="M27 47c2 2 8 2 10 0" stroke="#000" strokeOpacity={0.12} strokeWidth={2} fill="none" />
      {p.style === "long" && <Path d="M16 30c0-12 7-19 16-19s16 7 16 19v14H16Z" fill={p.hair} />}
      <Ellipse cx="32" cy="31" rx="11.5" ry="13" fill={p.skin} />
      <Ellipse cx="20.5" cy="32" rx="2.2" ry="3.2" fill={p.skin} />
      <Ellipse cx="43.5" cy="32" rx="2.2" ry="3.2" fill={p.skin} />
      <Ellipse cx="32" cy="38" rx="9" ry="5" fill={`url(#${uid}-shade)`} />
      {p.style === "short" && <Path d="M20 28c0-9 5-14 12-14s12 5 12 14c-3-4-7-6-12-6s-9 2-12 6Z" fill={p.hair} />}
      {p.style === "crop" && <Path d="M20.5 27c1-8 5.5-12 11.5-12s10.5 4 11.5 12c-4-3-8-4-11.5-4s-7.5 1-11.5 4Z" fill={p.hair} />}
      {p.style === "long" && <Path d="M20 29c0-9 5-15 12-15s12 6 12 15c-2-5-6-8-12-8-5 0-9 3-12 8Z" fill={p.hair} />}
      {p.style === "bun" && (
        <G fill={p.hair}>
          <Circle cx="32" cy="12" r="5" />
          <Path d="M20 29c0-9 5-14 12-14s12 5 12 14c-3-4-7-7-12-7s-9 3-12 7Z" />
        </G>
      )}
      {p.style === "curly" && (
        <G fill={p.hair}>
          <Circle cx="23" cy="22" r="5" />
          <Circle cx="29" cy="18" r="5.5" />
          <Circle cx="36" cy="18" r="5.5" />
          <Circle cx="41" cy="22" r="5" />
        </G>
      )}
      <G fill="#2A1F1B">
        <Ellipse cx="27.5" cy="31.5" rx="1.4" ry="1.7" />
        <Ellipse cx="36.5" cy="31.5" rx="1.4" ry="1.7" />
      </G>
      <Path d="M25.5 28c1.2-.8 2.8-.8 4 0M34.5 28c1.2-.8 2.8-.8 4 0" stroke={p.hair} strokeWidth={1.2} strokeLinecap="round" fill="none" />
      <Path d="M29 37.5c1.8 1.4 4.2 1.4 6 0" stroke="#7A3E2E" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <Circle cx="24.5" cy="35" r="2" fill="#E8838A" opacity={0.25} />
      <Circle cx="39.5" cy="35" r="2" fill="#E8838A" opacity={0.25} />
      {p.extra === "glasses" && (
        <G stroke="#1F2937" strokeWidth={1.2} fill="none">
          <Circle cx="27.5" cy="31.5" r="3.6" />
          <Circle cx="36.5" cy="31.5" r="3.6" />
          <Path d="M31.1 31.5h1.8" />
        </G>
      )}
      {p.extra === "cap" && <Path d="M19.5 25c1-7 6-11 12.5-11s11.5 4 12.5 11Zm12-1h16c0 2-2 3-4 3H31Z" fill="#334155" />}
      {p.extra === "beret" && <Path d="M18 23c2-6 8-9 15-9s13 3 13 7c0 2-3 3-8 3H22c-3 0-4-.5-4-1Z" fill="#1F2937" />}
      {p.extra === "helmet" && (
        <G>
          <Path d="M18.5 27c0-9 6-14.5 13.5-14.5S45.5 18 45.5 27Z" fill={p.shirt === "#E5E7EB" ? "#F8FAFC" : "#1E3A8A"} />
          <Path d="M22 22h20" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.4} strokeLinecap="round" />
        </G>
      )}
    </G>
  );
}
function AnimalArt({ a, uid }: { a: AnimalSpec; uid: string }) {
  const earL =
    a.ears === "pointy" ? "M16 26 19 9l11 10Z" :
    a.ears === "long" ? "M20 26c-3-10-3-19 1-21 4-1 6 9 6 19Z" :
    a.ears === "tufts" ? "M17 22 18 11l8 7Z" :
    a.ears === "floppy" ? "M17 20c-6 4-7 14-3 18 3-3 5-9 6-15Z" : "";
  const earR =
    a.ears === "pointy" ? "M48 26 45 9 34 19Z" :
    a.ears === "long" ? "M44 26c3-10 3-19-1-21-4-1-6 9-6 19Z" :
    a.ears === "tufts" ? "M47 22 46 11l-8 7Z" :
    a.ears === "floppy" ? "M47 20c6 4 7 14 3 18-3-3-5-9-6-15Z" : "";
  return (
    <G>
      {a.ears === "round" ? (
        <G>
          <Circle cx="19" cy="19" r="7" fill={a.patches ?? a.fur} />
          <Circle cx="45" cy="19" r="7" fill={a.patches ?? a.fur} />
          <Circle cx="19" cy="19" r="3.5" fill={a.patches ? "#4B4B52" : a.inner} />
          <Circle cx="45" cy="19" r="3.5" fill={a.patches ? "#4B4B52" : a.inner} />
        </G>
      ) : (
        <G>
          <Path d={earL} fill={a.ears === "floppy" ? a.inner : a.fur} />
          <Path d={earR} fill={a.ears === "floppy" ? a.inner : a.fur} />
        </G>
      )}
      <Ellipse cx="32" cy="35" rx="17" ry="16" fill={a.fur} stroke={a.fur === "#FFFFFF" ? "#E5E7EB" : "none"} />
      <Ellipse cx="32" cy="44" rx="15" ry="7" fill={`url(#${uid}-shade)`} />
      {a.patches && (
        <G fill={a.patches}>
          <Ellipse cx="25.5" cy="33" rx="4.5" ry="5.5" transform="rotate(-20 25.5 33)" />
          <Ellipse cx="38.5" cy="33" rx="4.5" ry="5.5" transform="rotate(20 38.5 33)" />
        </G>
      )}
      {a.muzzle && <Ellipse cx="32" cy="41" rx="8" ry="6" fill={a.muzzle} />}
      {a.ears === "tufts" && (
        <G>
          <Circle cx="25.5" cy="33" r="6" fill={a.inner} />
          <Circle cx="38.5" cy="33" r="6" fill={a.inner} />
        </G>
      )}
      <G fill="#1F1B24">
        <Circle cx="25.5" cy="33" r={a.ears === "tufts" ? 2.8 : 2} />
        <Circle cx="38.5" cy="33" r={a.ears === "tufts" ? 2.8 : 2} />
      </G>
      <Circle cx="26.2" cy="32.2" r="0.7" fill="#fff" />
      <Circle cx="39.2" cy="32.2" r="0.7" fill="#fff" />
      {a.ears === "tufts" ? (
        <Path d="M30 39l2 3 2-3Z" fill={a.muzzle} />
      ) : (
        <G>
          <Ellipse cx="32" cy="39" rx="2.2" ry="1.6" fill="#2A2228" />
          <Path d="M32 40.5v1.5M29.5 43c1.4 1 3.6 1 5 0" stroke="#2A2228" strokeWidth={1.1} strokeLinecap="round" fill="none" />
        </G>
      )}
    </G>
  );
}
function NatureArt({ id }: { id: string }) {
  switch (id) {
    case "sun":
      return (
        <G>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <Rect key={deg} x="30.5" y="8" width="3" height="8" rx="1.5" fill="#F59E0B" transform={`rotate(${deg} 32 32)`} />
          ))}
          <Circle cx="32" cy="32" r="12" fill="#FBBF24" />
          <Circle cx="28" cy="28" r="4" fill="#FDE68A" opacity={0.8} />
        </G>
      );
    case "moon":
      return (
        <G>
          <Path d="M40 14a18 18 0 1 0 10 31 15 15 0 0 1-10-31Z" fill="#C7D2FE" />
          <Circle cx="30" cy="36" r="2.5" fill="#A5B4FC" />
          <Circle cx="25" cy="27" r="1.6" fill="#A5B4FC" />
          <Circle cx="47" cy="18" r="1.2" fill="#FFFFFF" />
          <Circle cx="52" cy="28" r="0.9" fill="#FFFFFF" />
        </G>
      );
    case "leaf":
      return (
        <G>
          <Path d="M14 50C14 26 30 14 50 14c0 22-14 36-36 36Z" fill="#4E9A62" />
          <Path d="M18 46 44 20" stroke="#BBF7D0" strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M27 37h9M32 32h9M23 41v-8" stroke="#BBF7D0" strokeWidth={1.2} strokeLinecap="round" />
        </G>
      );
    case "cloud":
      return (
        <G>
          <Path d="M18 44a9 9 0 0 1 1-18 12 12 0 0 1 23-2 10 10 0 0 1 4 20Z" fill="#FFFFFF" />
          <Path d="M18 44h28" stroke="#BAE6FD" strokeWidth={2} strokeLinecap="round" />
          <Circle cx="44" cy="19" r="5" fill="#FBBF24" opacity={0.9} />
        </G>
      );
    default:
      return (
        <G>
          {[0, 72, 144, 216, 288].map((deg) => (
            <Ellipse key={deg} cx="32" cy="20" rx="7" ry="10" fill="#F472B6" transform={`rotate(${deg} 32 32)`} />
          ))}
          <Circle cx="32" cy="32" r="6" fill="#FCD34D" />
          <Circle cx="30.5" cy="30.5" r="2" fill="#FEF3C7" />
        </G>
      );
  }
}
function SketchAvatar({ preset, size }: { preset: string; size: number }) {
  const id = preset.replace(/^preset:/, "");
  const item =
    avatarPresets.find((entry) => entry.id === id) ?? avatarPresets[0];
  const uid = `av-${item.id}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      accessibilityLabel={`${item.label} avatar`}
    >
      <Defs>
        <LinearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={item.bg} />
          <Stop offset="1" stopColor={item.ink} stopOpacity={0.28} />
        </LinearGradient>
        <LinearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.1} />
        </LinearGradient>
        <ClipPath id={`${uid}-clip`}>
          <Circle cx="32" cy="32" r="32" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${uid}-clip)`}>
        <Rect width="64" height="64" fill={`url(#${uid}-bg)`} />
        {people[item.id] ? (
          <PersonArt p={people[item.id]} uid={uid} />
        ) : animals[item.id] ? (
          <AnimalArt a={animals[item.id]} uid={uid} />
        ) : (
          <NatureArt id={item.id} />
        )}
      </G>
    </Svg>
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

const avatarTints = [
  { bg: "#EEF2FF", ink: "#4338CA" },
  { bg: "#ECFDF5", ink: "#047857" },
  { bg: "#FFF7ED", ink: "#C2410C" },
  { bg: "#F0F9FF", ink: "#0369A1" },
  { bg: "#FDF2F8", ink: "#BE185D" },
  { bg: "#F1F5F9", ink: "#334155" },
];
function avatarTint(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return avatarTints[hash % avatarTints.length];
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
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  const tint = avatarTint(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color === "#EEE8F8" ? tint.bg : color,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Label size={size * 0.36} bold color={tint.ink}>
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
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: error ? c.rose : c.soft,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon
          name={error ? "help" : "bell"}
          size={16}
          color={error ? c.negative : c.muted}
        />
      </View>
      <Label flex={1} size={13} color={error ? c.negative : c.text}>
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
  const c = useColors();
  return (
    <YStack
      alignItems="center"
      paddingVertical={20}
      gap={10}
      maxWidth={420}
      width="100%"
      alignSelf="center"
    >
      <Mascot size={84} mood="wave" animate={false} />
      <Label bold size={15} textAlign="center">
        {title}
      </Label>
      <Label muted size={13} textAlign="center">
        {detail}
      </Label>
      {!!action && (
        <Button compact secondary onPress={onPress}>
          {action}
        </Button>
      )}
    </YStack>
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
      <Mascot size={52} mood={mood} animate={mood === "success"} />
      <Label size={13} flex={1}>
        {message}
      </Label>
    </XStack>
  );
}
export function Brand({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <XStack
      gap={9}
      alignItems="center"
      accessible
      accessibilityLabel="SettleUp"
    >
      <LogoMark size={compact ? 28 : 34} />
      {!iconOnly && (
        <Label
          bold
          size={compact ? 17 : 20}
          letterSpacing={-0.4}
          flexShrink={1}
          numberOfLines={1}
        >
          SettleUp
        </Label>
      )}
    </XStack>
  );
}
/**
 * "Pip": a soft, coin-like character in the app palette. Smooth gradients and
 * a simple face keep it friendly without looking like a game sprite. Moods
 * only change the eyes, mouth and a small badge. Floats gently unless the
 * system asks for reduced motion.
 */
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
  const dark = useSession((s) => s.dark);
  const motion = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReducedMotion(value))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (mark || !animate || reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, mark, reducedMotion, motion]);
  const id = `pip-${mood}-${dark ? "d" : "l"}`;
  const eyes =
    mood === "success" ? (
      <G stroke="#1E1B4B" strokeWidth={4} strokeLinecap="round" fill="none">
        <Path d="M68 86 q6 -6 12 0" />
        <Path d="M108 86 q6 -6 12 0" />
      </G>
    ) : mood === "reading" ? (
      <G fill="#1E1B4B">
        <Ellipse cx="74" cy="90" rx="5" ry="4" />
        <Ellipse cx="114" cy="90" rx="5" ry="4" />
      </G>
    ) : (
      <G fill="#1E1B4B">
        <Ellipse cx="74" cy="86" rx="5.5" ry="7" />
        <Ellipse cx="114" cy="86" rx="5.5" ry="7" />
        <Circle cx="76" cy="83" r="1.8" fill="#fff" />
        <Circle cx="116" cy="83" r="1.8" fill="#fff" />
      </G>
    );
  const mouth =
    mood === "help" ? (
      <Path d="M86 108 q8 -5 16 0" stroke="#1E1B4B" strokeWidth={3.5} strokeLinecap="round" fill="none" />
    ) : mood === "reading" ? (
      <Path d="M88 106 h12" stroke="#1E1B4B" strokeWidth={3.5} strokeLinecap="round" />
    ) : (
      <Path d="M84 102 q10 10 20 0" stroke="#1E1B4B" strokeWidth={3.5} strokeLinecap="round" fill="none" />
    );
  const badge =
    mood === "success" ? (
      <G>
        <Circle cx="146" cy="52" r="15" fill="#10B981" />
        <Path d="m139 52 5 5 9-10" stroke="#fff" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </G>
    ) : mood === "help" ? (
      <G>
        <Circle cx="146" cy="52" r="15" fill="#F59E0B" />
        <Path d="M146 45v9" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
        <Circle cx="146" cy="60" r="2" fill="#fff" />
      </G>
    ) : mood === "reading" ? (
      <G>
        <Rect x="128" y="96" width="34" height="42" rx="6" fill="#FFFFFF" stroke="#E0E7FF" strokeWidth={2} />
        <Path d="M135 108h20M135 116h14M135 124h18" stroke="#A5B4FC" strokeWidth={3} strokeLinecap="round" />
      </G>
    ) : null;
  const translateY = motion.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.03] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox={mark ? "22 20 144 144" : "0 0 188 188"}>
        <Defs>
          <RadialGradient id={`${id}-body`} cx="38%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#A5B4FC" />
            <Stop offset="0.55" stopColor="#6366F1" />
            <Stop offset="1" stopColor="#4338CA" />
          </RadialGradient>
          <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {!mark && (
          <Ellipse cx="94" cy="168" rx="46" ry="7" fill={dark ? "#000" : "#1E1B4B"} opacity={dark ? 0.35 : 0.1} />
        )}
        {!mark && (
          <G fill="#3730A3">
            <Rect x="58" y="146" width="24" height="14" rx="7" />
            <Rect x="106" y="146" width="24" height="14" rx="7" />
          </G>
        )}
        <Rect x="30" y="34" width="128" height="120" rx="52" fill={`url(#${id}-body)`} />
        <Ellipse cx="94" cy="134" rx="50" ry="18" fill="#312E81" opacity={0.16} />
        <Rect x="44" y="42" width="100" height="44" rx="22" fill={`url(#${id}-rim)`} />
        <Circle cx="132" cy="52" r="3" fill="#FFFFFF" opacity={0.8} />

        <Circle cx="62" cy="100" r="7" fill="#F9A8D4" opacity={0.45} />
        <Circle cx="126" cy="100" r="7" fill="#F9A8D4" opacity={0.45} />
        <G>
          <Ellipse cx="74" cy="88" rx="13" ry="14" fill="#FFFFFF" opacity={mood === "success" ? 0 : 0.92} />
          <Ellipse cx="114" cy="88" rx="13" ry="14" fill="#FFFFFF" opacity={mood === "success" ? 0 : 0.92} />
          {eyes}
        </G>
        {mouth}
        <Path d="M86 30 q8 -12 16 0" stroke="#F59E0B" strokeWidth={6} strokeLinecap="round" fill="none" />
        {badge}
      </Svg>
    </Animated.View>
  );
});
/** The brand mark is Pip, the mascot, without motion. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return <Mascot size={size * 1.25} mood="wave" mark />;
}

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
    <Illustration
      name={scene === "coins" ? "settled" : scene === "wallet" ? "wallet" : "secure"}
      size={Math.min(size, 300)}
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
        borderColor: c.line,
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
  footer,
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
  selectionIcon?: IconName | null;
  footer?: React.ReactNode;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
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
            maxHeight: "100%",
            flexShrink: 1,
            padding: width < 360 ? 14 : 20,
            gap: 14,
            borderRadius: 24,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
          }}
        >
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <Heading size={20} flex={1} minWidth={0}>
              {title}
            </Heading>
            <IconButton name="close" label="Close" onPress={onClose} />
          </XStack>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={placeholder ?? `Search ${title.toLocaleLowerCase()}…`}
          />
          <ScrollView
            style={{ flexShrink: 1 }}
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
                    borderColor: active ? c.soft : c.line,
                    backgroundColor: active ? c.soft : c.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <YStack flex={1} minWidth={0} gap={2}>
                    <Label bold size={13}>
                      {option.label}
                    </Label>
                    {!!option.detail && (
                      <Label muted size={11}>
                        {option.detail}
                      </Label>
                    )}
                  </YStack>
                  {active || selectionIcon ? (
                    <Icon
                      name={active ? "check" : selectionIcon!}
                      size={18}
                      color={active ? c.accent : c.muted}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            {!filtered.length && (
              <Label muted size={12} style={{ paddingVertical: 22 }}>
                No matches found.
              </Label>
            )}
          </ScrollView>
          {footer}
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
  const { width, fontScale } = useWindowDimensions();
  const narrow = width / Math.max(fontScale, 1) < 360;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: width < 360 ? 10 : 20,
          backgroundColor: "rgba(22,24,28,0.58)",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={{ position: "absolute", inset: 0 }}
        />
        <ScrollView
          accessibilityRole="alert"
          bounces={false}
          style={{
            width: "100%",
            maxWidth: 460,
            maxHeight: "100%",
            flexGrow: 0,
            borderRadius: 26,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            shadowColor: "#25202E",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 14,
          }}
          contentContainerStyle={{ padding: narrow ? 14 : 20, gap: 16 }}
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
            <YStack flex={1} minWidth={0} gap={5} paddingTop={1}>
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
                  minWidth: narrow ? "100%" : 96,
                  maxWidth: "100%",
                  flexGrow: narrow ? 1 : 0,
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
        </ScrollView>
      </View>
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
        borderColor: active ? c.primary : c.line,
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
