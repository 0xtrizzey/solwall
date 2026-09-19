// esbuild bundles CSS via side-effect imports; TypeScript 7 requires a
// declaration for them or it errors with TS2882.
declare module "*.css";
