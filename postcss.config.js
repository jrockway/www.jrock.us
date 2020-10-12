const imports = require("postcss-import");
const mixins = require("postcss-mixins");
const nested = require("postcss-nested");
const postCSSPresetEnv = require("postcss-preset-env");
const color = require("postcss-color-mod-function");
const cssnano = require("cssnano");
const url = require("postcss-url");

module.exports = () => ({
    plugins: [
        imports,
        mixins,
        nested,
        postCSSPresetEnv({
            stage: 1,
            preserve: true,
            features: {
                "custom-properties": true,
            },
        }),
        color,
        url({
            url: "copy",
            // This kind of tries to preserve the original filename.  Necessary because it won't copy
            // files when useHash is not true.
            useHash: true,
            hashOptions: {
                method: (_) => {
                    return "";
                },
                append: true,
            },
        }),
        cssnano({
            preset: "default",
        }),
    ],
});
