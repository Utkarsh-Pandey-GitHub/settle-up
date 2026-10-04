const { withAppBuildGradle } = require("@expo/config-plugins");

// Used by local Gradle builds too: app.json owns both the release and OTA version.
const versionConfig = `
// SettleUp release versions: keep native runtime and OTA appVersion policy aligned.
def settleupExpo = new groovy.json.JsonSlurper().parse(rootProject.file("../app.json")).expo
if (settleupExpo.runtimeVersion?.policy != "appVersion" ||
    settleupExpo.android?.runtimeVersion != null ||
    !(settleupExpo.android?.versionCode instanceof Number) ||
    settleupExpo.android.versionCode <= 0) {
    throw new GradleException("SettleUp requires runtimeVersion.policy=appVersion and a positive android.versionCode in app.json, without an Android runtime override.")
}
android.defaultConfig {
    versionCode settleupExpo.android.versionCode.intValue()
    versionName settleupExpo.version
}
def settleupStrings = file("src/main/res/values/strings.xml")
def settleupXml = settleupStrings.getText("UTF-8")
def settleupRuntime = '<string name="expo_runtime_version">' + settleupExpo.version + '</string>'
def settleupUpdatedXml = settleupXml.contains('name="expo_runtime_version"')
    ? settleupXml.replaceAll(/<string name="expo_runtime_version">[^<]*<\\/string>/, settleupRuntime)
    : settleupXml.replace('</resources>', '  ' + settleupRuntime + '\\n</resources>')
if (settleupUpdatedXml != settleupXml) settleupStrings.write(settleupUpdatedXml, "UTF-8")
`;

module.exports = (config) => {
  config = withAppBuildGradle(config, (next) => {
    if (!next.modResults.contents.includes("def settleupExpo =")) {
      next.modResults.contents += versionConfig;
    }
    return next;
  });
  return config;
};

module.exports.versionConfig = versionConfig;
