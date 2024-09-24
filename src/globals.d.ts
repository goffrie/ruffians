import "@types/webpack-env"; // for `module.hot`

declare const process: {
    env: {
        NODE_ENV: string;
    };
};
