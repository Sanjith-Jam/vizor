import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { RoadScanner } from "../components/RoadScanner";

/** Dedicated full-screen Road AI Pothole Scanner screen. */
export default function ScanRoadScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <RoadScanner onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
