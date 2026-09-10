/**
 * @type {import('@babel/core').TransformOptions}
 */
module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Must run first. Matches the setup in LegendApp/legend-music, which is
      // a known-working react-native-macos app.
      "babel-plugin-react-compiler",
    ],
  };
};
