import React from "react";
import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";
import {
  colors,
  fonts,
  type,
  type FontWeightName,
  type TypeVariant,
} from "../../theme";

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  weight?: FontWeightName;
  color?: string;
  align?: TextStyle["textAlign"];
}

/** The only Text the app renders directly - see theme/index.ts's fonts note. */
export function AppText({
  variant = "body",
  weight = "regular",
  color = colors.text,
  align,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        type[variant],
        { fontFamily: fonts[weight], color, textAlign: align },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
    includeFontPadding: false,
  },
});
