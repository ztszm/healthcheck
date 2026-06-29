import cloudbaseSDK from "@cloudbase/js-sdk";

export const cloudbase = cloudbaseSDK.init({
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID,
  region: import.meta.env.VITE_CLOUDBASE_REGION,
  accessKey: import.meta.env.VITE_CLOUDBASE_ACCESS_KEY
});