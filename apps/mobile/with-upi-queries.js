const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = (config) =>
  withAndroidManifest(config, (next) => {
    const manifest = next.modResults.manifest;
    const queries = (manifest.queries ??= [{}]);
    const root = queries[0];
    const intents = (root.intent ??= []);
    const hasUpi = intents.some((intent) =>
      intent.data?.some((data) => data.$?.["android:scheme"] === "upi"),
    );
    if (!hasUpi)
      intents.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        category: [
          { $: { "android:name": "android.intent.category.BROWSABLE" } },
        ],
        data: [{ $: { "android:scheme": "upi", "android:host": "pay" } }],
      });
    return next;
  });
