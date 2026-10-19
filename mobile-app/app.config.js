module.exports = ({ config }) => ({
  ...config,
  name: "Vizor",
  plugins: [
    ...(config.plugins || []).filter(
      (plugin) =>
        (Array.isArray(plugin) ? plugin[0] : plugin) !== "react-native-maps",
    ),
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || "",
      },
    ],
  ],
});
