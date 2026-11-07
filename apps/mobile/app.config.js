module.exports = ({ config }) => {
  if (process.env.SETTLEUP_DEV_BUILD !== "1") return config;
  return {
    ...config,
    name: "SettleUp Dev",
    android: {
      ...config.android,
      package: "app.settleup.mobile.dev",
    },
  };
};
