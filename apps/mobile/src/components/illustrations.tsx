import React from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useSession } from "../data/session";

/**
 * Flat spot illustrations in the app palette: soft shapes, one accent, no
 * outlines-for-kids. Used for empty states, success moments and onboarding.
 */
export type IllustrationName =
  | "settled"
  | "wallet"
  | "secure"
  | "receipt"
  | "group"
  | "empty"
  | "chat";

function tones(dark: boolean) {
  return dark
    ? {
        bg: "#1E2140",
        card: "#252A36",
        line: "#3A4152",
        ink: "#C7D2FE",
        accent: "#818CF8",
        accent2: "#6366F1",
        green: "#34D399",
        amber: "#FBBF24",
        muted: "#64748B",
      }
    : {
        bg: "#EEF2FF",
        card: "#FFFFFF",
        line: "#E0E7FF",
        ink: "#312E81",
        accent: "#6366F1",
        accent2: "#4F46E5",
        green: "#10B981",
        amber: "#F59E0B",
        muted: "#CBD5E1",
      };
}

export function Illustration({
  name,
  size = 160,
}: {
  name: IllustrationName;
  size?: number;
}) {
  const t = tones(useSession((s) => s.dark));
  const shadow = "rgba(15,23,42,0.08)";
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 160 136" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id="acc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={t.accent} />
          <Stop offset="1" stopColor={t.accent2} />
        </LinearGradient>
      </Defs>
      <Circle cx="80" cy="70" r="58" fill={t.bg} />
      {name === "settled" && (
        <G>
          <Rect x="38" y="44" width="84" height="58" rx="12" fill={shadow} />
          <Rect x="36" y="40" width="84" height="58" rx="12" fill={t.card} />
          <Rect x="48" y="54" width="34" height="6" rx="3" fill={t.line} />
          <Rect x="48" y="66" width="52" height="6" rx="3" fill={t.line} />
          <Rect x="48" y="78" width="24" height="6" rx="3" fill={t.line} />
          <Circle cx="112" cy="40" r="18" fill={t.green} />
          <Path d="m104 40 6 6 10-12" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {name === "wallet" && (
        <G>
          <Circle cx="104" cy="38" r="12" fill={t.amber} />
          <Circle cx="118" cy="50" r="10" fill={t.amber} opacity="0.75" />
          <Rect x="34" y="50" width="92" height="60" rx="14" fill="url(#acc)" />
          <Rect x="34" y="44" width="80" height="18" rx="9" fill={t.ink} opacity="0.9" />
          <Rect x="96" y="70" width="34" height="22" rx="11" fill={t.card} />
          <Circle cx="108" cy="81" r="4" fill={t.accent2} />
        </G>
      )}
      {name === "secure" && (
        <G>
          <Path d="M80 26 112 38v26c0 22-14 36-32 44-18-8-32-22-32-44V38Z" fill="url(#acc)" />
          <Path d="M80 34 104 43v21c0 16-10 27-24 34V34Z" fill="#fff" opacity="0.15" />
          <Rect x="68" y="62" width="24" height="20" rx="5" fill={t.card} />
          <Path d="M73 62v-5a7 7 0 0 1 14 0v5" stroke={t.card} strokeWidth="4" fill="none" />
          <Circle cx="80" cy="72" r="3" fill={t.accent2} />
        </G>
      )}
      {name === "receipt" && (
        <G>
          <Path d="M52 28h56v84l-7-5-7 5-7-5-7 5-7-5-7 5-7-5-7 5Z" fill={t.card} />
          <Rect x="62" y="42" width="36" height="6" rx="3" fill={t.accent} />
          <Rect x="62" y="56" width="28" height="5" rx="2.5" fill={t.line} />
          <Rect x="62" y="67" width="34" height="5" rx="2.5" fill={t.line} />
          <Rect x="62" y="78" width="22" height="5" rx="2.5" fill={t.line} />
          <Rect x="62" y="92" width="36" height="6" rx="3" fill={t.ink} opacity="0.85" />
        </G>
      )}
      {name === "group" && (
        <G>
          <Circle cx="56" cy="58" r="13" fill={t.amber} />
          <Rect x="38" y="76" width="36" height="28" rx="14" fill={t.amber} opacity="0.85" />
          <Circle cx="104" cy="58" r="13" fill={t.green} />
          <Rect x="86" y="76" width="36" height="28" rx="14" fill={t.green} opacity="0.85" />
          <Circle cx="80" cy="50" r="15" fill="url(#acc)" />
          <Rect x="59" y="70" width="42" height="34" rx="17" fill="url(#acc)" />
        </G>
      )}
      {name === "empty" && (
        <G>
          <Rect x="44" y="40" width="72" height="56" rx="12" fill={t.card} />
          <Rect x="56" y="54" width="48" height="6" rx="3" fill={t.line} />
          <Rect x="56" y="66" width="32" height="6" rx="3" fill={t.line} />
          <Circle cx="108" cy="94" r="14" fill="url(#acc)" />
          <Path d="M108 88v12M102 94h12" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
        </G>
      )}
      {name === "chat" && (
        <G>
          <Rect x="34" y="38" width="70" height="40" rx="14" fill={t.card} />
          <Rect x="46" y="51" width="40" height="5" rx="2.5" fill={t.line} />
          <Rect x="46" y="61" width="26" height="5" rx="2.5" fill={t.line} />
          <Rect x="62" y="70" width="64" height="34" rx="14" fill="url(#acc)" />
          <Path d="m84 81 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#fff" />
          <Rect x="98" y="84" width="18" height="5" rx="2.5" fill="#fff" opacity="0.7" />
        </G>
      )}
    </Svg>
  );
}

/**
 * Decorative backdrop for hero cards: a deep indigo gradient with soft
 * layered waves, a faint dot grid and a glow. Sits behind content
 * (absolute fill); the parent must set overflow: "hidden".
 */
export function HeroBackdrop({ animated = true }: { animated?: boolean }) {
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const drift = React.useRef(new Animated.Value(0)).current;
  const glow = React.useRef(new Animated.Value(0)).current;
  const [still, setStill] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => live && setStill(reduce || !animated))
      .catch(() => live && setStill(!animated));
    return () => {
      live = false;
    };
  }, [animated]);
  React.useEffect(() => {
    if (still || !box.w) return;
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [still, box.w, drift, glow]);
  const dark = useSession((s) => s.dark);
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) =>
        setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {box.w > 0 && (
        <>
          <HeroBase width={box.w} height={box.h} dark={dark} />
          <Animated.View
            style={{
              position: "absolute",
              top: -box.h * 0.35,
              right: -box.w * 0.2,
              width: box.w * 0.7,
              height: box.w * 0.7,
              borderRadius: box.w,
              backgroundColor: "#A5B4FC",
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: box.w * 1.4,
              height: box.h,
              transform: [
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -box.w * 0.4] }) },
              ],
            }}
          >
            <HeroWaves width={box.w * 1.4} height={box.h} />
          </Animated.View>
        </>
      )}
    </View>
  );
}
function HeroBase({ width, height, dark }: { width: number; height: number; dark: boolean }) {
  const from = dark ? "#312E81" : "#4F46E5";
  const to = dark ? "#1E1B4B" : "#3730A3";
  const dots = [];
  for (let x = 0; x < 6; x++)
    for (let y = 0; y < 4; y++)
      dots.push(<Circle key={`${x}-${y}`} cx={250 + x * 14} cy={22 + y * 14} r="1.4" fill="#fff" opacity="0.18" />);
  return (
    <Svg width={width} height={height} viewBox="0 0 360 220" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="360" height="220" fill="url(#hero)" />
      {dots}
    </Svg>
  );
}
/** Wider-than-card wave band (504 units = 1.4 × 360) so it can drift. */
function HeroWaves({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 504 220" preserveAspectRatio="none">
      <Path d="M0 150 C 60 120 120 175 190 150 S 300 115 360 140 S 450 165 504 145 V220 H0Z" fill="#fff" opacity="0.06" />
      <Path d="M0 172 C 70 150 140 200 210 176 S 310 150 360 168 S 460 190 504 170 V220 H0Z" fill="#fff" opacity="0.07" />
      <Path d="M0 196 C 80 180 150 214 230 198 S 320 184 360 194 S 460 210 504 196 V220 H0Z" fill="#fff" opacity="0.08" />
      <Path d="M0 132 C 70 106 130 158 200 134 S 310 98 360 120 S 450 150 504 126" stroke="#C7D2FE" strokeOpacity="0.25" strokeWidth="1.2" fill="none" />
    </Svg>
  );
}

/**
 * Page header used across the app: the same indigo wave card as the home
 * summary, with a title, optional eyebrow/subtitle, an optional light action
 * button, and room for extra content below.
 */
export function PageHero({
  title,
  subtitle,
  eyebrow,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: { label: string; onPress: () => void; icon?: React.ReactNode };
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 20,
        overflow: "hidden",
        paddingHorizontal: 20,
        paddingVertical: 20,
        backgroundColor: "#4338CA",
        gap: 14,
      }}
    >
      <HeroBackdrop animated={false} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {!!eyebrow && (
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 11,
                letterSpacing: 1.2,
                color: "rgba(224,231,255,0.85)",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </Text>
          )}
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 24,
              lineHeight: 30,
              letterSpacing: -0.6,
              color: "#FFFFFF",
            }}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                lineHeight: 19,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              minHeight: 40,
              borderRadius: 12,
              backgroundColor: pressed ? "#E0E7FF" : "#FFFFFF",
            })}
          >
            {action.icon}
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#3730A3" }}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}
