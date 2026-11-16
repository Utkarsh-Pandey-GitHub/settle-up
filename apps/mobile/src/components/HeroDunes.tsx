import React from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useSession } from "../data/session";

const BANDS = 6;
const ANGLE = 0.55;
// Each band layer is this much larger than the card so it can slide without showing its ends.
const MARGIN = 130;

function bandPaths(index: number, width: number, height: number) {
  const scale = width / 320;
  const from = -width * 1.6 - MARGIN * 2;
  const to = width * 0.7 + MARGIN * 2;
  const y = (x: number) =>
    (40 + index * 38) * scale +
    Math.sin(x * 0.012 + index * 1.3) * 12 * scale +
    Math.sin(x * 0.03 + index) * 4 * scale;
  let line = "";
  for (let x = from; x <= to; x += 8)
    line += `${line ? "L" : "M"}${x.toFixed(1)} ${y(x).toFixed(1)}`;
  const floor = (height + width) * 2;
  return { line, fill: `${line}L${to} ${floor}L${from} ${floor}Z` };
}

/** Diagonal tonal dune bands that slowly slide past each other behind the home hero. */
export function HeroDunes() {
  const dark = useSession((s) => s.dark);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [still, setStill] = React.useState(true);
  const drift = React.useRef(
    Array.from({ length: BANDS }, (_, i) => new Animated.Value(i % 2 ? 1 : -1)),
  ).current;
  const bob = React.useRef(
    Array.from({ length: BANDS }, (_, i) => new Animated.Value(i % 2 ? -1 : 1)),
  ).current;
  React.useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => live && setStill(reduce))
      .catch(() => live && setStill(false));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  React.useEffect(() => {
    // Start only once the band layers are mounted, or the native animation never attaches.
    if (still || !box.w) return;
    const swing = (value: Animated.Value, first: number, duration: number) => {
      const step = (toValue: number) =>
        Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
      return Animated.loop(Animated.sequence([step(first), step(-first)]));
    };
    const loops = [
      ...drift.map((value, i) => swing(value, i % 2 ? -1 : 1, 14000 + i * 2600)),
      ...bob.map((value, i) => swing(value, i % 2 ? 1 : -1, 5200 + i * 900)),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [still, box.w, drift, bob]);
  const bands = React.useMemo(
    () =>
      box.w
        ? Array.from({ length: BANDS }, (_, i) => bandPaths(BANDS - 1 - i, box.w, box.h))
        : [],
    [box.w, box.h],
  );
  const reach = MARGIN * 0.85;
  const lift = 9;
  const slide = (i: number, along: number, across: number) =>
    Animated.add(
      drift[i].interpolate({ inputRange: [-1, 1], outputRange: [-reach * along, reach * along] }),
      bob[i].interpolate({ inputRange: [-1, 1], outputRange: [-lift * across, lift * across] }),
    );
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) =>
        setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })
      }
    >
      {box.w > 0 && (
        <>
          <Svg width={box.w} height={box.h}>
            <Defs>
              <LinearGradient id="duneBase" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={dark ? "#312E81" : "#3730A3"} />
                <Stop offset="1" stopColor={dark ? "#1E1B4B" : "#4338CA"} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#duneBase)" />
          </Svg>
          {bands.map((band, i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                top: -MARGIN,
                left: -MARGIN,
                transform: [
                  { translateX: slide(i, Math.cos(ANGLE), -Math.sin(ANGLE)) },
                  { translateY: slide(i, Math.sin(ANGLE), Math.cos(ANGLE)) },
                ],
              }}
            >
              <Svg width={box.w + MARGIN * 2} height={box.h + MARGIN * 2}>
                <G transform={`translate(${box.w + MARGIN} ${MARGIN}) rotate(${(ANGLE * 180) / Math.PI})`}>
                  <Path d={band.fill} fill={i % 2 ? "rgba(165,180,252,0.09)" : "rgba(129,140,248,0.09)"} />
                  <Path d={band.line} stroke="rgba(255,255,255,0.1)" strokeWidth={1} fill="none" />
                </G>
              </Svg>
            </Animated.View>
          ))}
        </>
      )}
    </View>
  );
}
