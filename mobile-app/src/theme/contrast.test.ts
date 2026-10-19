import { test } from "node:test";
import assert from "node:assert/strict";
import { colors } from "./index";

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((c) => {
      const value = parseInt(c, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
test("mobile reading, control and urgent text retain AA contrast", () => {
  const pairs = [
    [colors.text, colors.bg],
    [colors.textMuted, colors.bg],
    [colors.textFaint, colors.surface],
    [colors.textFaint, colors.surfaceRaised],
    [colors.onAccent, colors.accent],
    [colors.warning, colors.warningDim],
    [colors.success, colors.successDim],
    [colors.danger, colors.dangerDim],
    [colors.onAccent, colors.dangerStrong],
    [colors.onDarkMuted, "#05080F"],
    ["#FFFFFF", colors.sos],
    [colors.hudGlow, "#000000"],
  ];
  for (const [fg, bg] of pairs) {
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${fg} on ${bg}`);
  }
});
