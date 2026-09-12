const { withAndroidManifest } = require("expo/config-plugins");
module.exports = (
  config,
  { clientId = process.env.EXPO_PUBLIC_TRUECALLER_CLIENT_ID } = {},
) => {
  if (!clientId) return config;
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    const items = app["meta-data"] || [];
    app["meta-data"] = items.filter(
      (item) =>
        item.$["android:name"] !== "com.truecaller.android.sdk.ClientId",
    );
    app["meta-data"].push({
      $: {
        "android:name": "com.truecaller.android.sdk.ClientId",
        "android:value": clientId,
      },
    });
    return config;
  });
};
