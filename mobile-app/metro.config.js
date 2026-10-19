const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, "../shared"),
];
// Native BLE has no browser implementation; keep preview capability explicit.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-ble-plx") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "src/ble/BleModule.web.ts"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
