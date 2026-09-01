import React, { useRef, useState } from "react";
import { View, PanResponder, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import ViewShot from "react-native-view-shot";
import { Button } from "./ui";
import { colors, spacing } from "../lib/theme";

// Pure-native signature capture -- no embedded WebView/HTML (unlike react-native-signature-canvas,
// which rendered an invisible/non-interactive footer inside a Modal in testing on a real device).
// Draws strokes as SVG paths via PanResponder, then rasterizes the view to a base64 PNG on Confirm --
// the same data: URL shape the web app's canvas.toDataURL() produces, so the backend payload is
// unchanged either way.
export default function SignaturePad({ onConfirm, onCancel }) {
  const shotRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const currentPoints = useRef([]);
  const [, forceRender] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPoints.current = [`M${locationX.toFixed(1)},${locationY.toFixed(1)}`];
        forceRender((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPoints.current.push(`L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
        forceRender((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (currentPoints.current.length > 1) {
          setPaths((p) => [...p, currentPoints.current.join(" ")]);
        }
        currentPoints.current = [];
      },
    })
  ).current;

  const clear = () => {
    setPaths([]);
    currentPoints.current = [];
    forceRender((n) => n + 1);
  };

  const confirm = async () => {
    if (paths.length === 0) { onCancel(); return; }
    // Give the last stroke's state update a frame to actually paint natively before snapshotting --
    // capturing in the same tick as the final setPaths() can race ahead of the native render commit.
    await new Promise((r) => requestAnimationFrame(r));
    const uri = await shotRef.current.capture();
    onConfirm(uri);
  };

  const liveD = currentPoints.current.length > 1 ? currentPoints.current.join(" ") : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button title="Cancel" variant="outline" onPress={onCancel} style={styles.headerBtn} />
        <Button title="Clear" variant="outline" onPress={clear} style={styles.headerBtn} />
        <Button title="Confirm" onPress={confirm} style={styles.headerBtn} />
      </View>
      <ViewShot
        ref={shotRef}
        options={{ format: "png", quality: 0.9, result: "data-uri", useRenderInContext: true }}
        style={styles.padWrap}
      >
        <View style={styles.pad} collapsable={false} {...panResponder.panHandlers}>
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke="#0b0b0d" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
            {liveD && <Path d={liveD} stroke="#0b0b0d" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
          </Svg>
        </View>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.xxl },
  headerBtn: { flex: 1 },
  padWrap: { flex: 1, margin: spacing.lg, marginTop: 0 },
  pad: { flex: 1, backgroundColor: "#fff", borderRadius: 8 },
});
