import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NAVIGATOR_CONFIG_STORAGE_KEY,
  NAVIGATOR_CONFIG_UPDATED_EVENT,
  createModelObjectUrls,
  deleteModelFile,
  loadNavigatorConfig,
  resetNavigatorConfig,
  saveModelFile,
  saveNavigatorConfig,
} from "../services/navigatorConfig.js";

export default function useNavigatorConfig() {
  const [config, setConfig] = useState(loadNavigatorConfig);
  const [modelObjectUrls, setModelObjectUrls] = useState([]);
  const [logoObjectUrl, setLogoObjectUrl] = useState("");
  const [modelAssetStatus, setModelAssetStatus] = useState("ready");
  const [logoAssetStatus, setLogoAssetStatus] = useState("ready");

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === NAVIGATOR_CONFIG_STORAGE_KEY) {
        setConfig(loadNavigatorConfig());
      }
    };

    const handleConfigUpdated = (event) => {
      setConfig(event.detail ?? loadNavigatorConfig());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(NAVIGATOR_CONFIG_UPDATED_EVENT, handleConfigUpdated);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(NAVIGATOR_CONFIG_UPDATED_EVENT, handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let activeUrls = [];

    async function loadModelUrls() {
      const selectedModel = config.modelFiles.filter(
        (modelFile) => modelFile.id === config.buildingModelFileId,
      );
      const selectedLogo = config.modelFiles.filter(
        (modelFile) => modelFile.id === config.logoFileId,
      );
      const selectedFiles = [...selectedModel, ...selectedLogo].filter(
        (file, index, files) =>
          files.findIndex((candidate) => candidate.id === file.id) === index,
      );

      if (!selectedFiles.length) {
        setModelObjectUrls([]);
        setLogoObjectUrl("");
        setModelAssetStatus(config.buildingModelFileId ? "missing" : "ready");
        setLogoAssetStatus(config.logoFileId ? "missing" : "ready");
        return;
      }

      setModelAssetStatus(config.buildingModelFileId ? "loading" : "ready");
      setLogoAssetStatus(config.logoFileId ? "loading" : "ready");
      const nextUrls = await createModelObjectUrls(selectedFiles);

      if (isCancelled) {
        nextUrls.forEach((modelFile) => URL.revokeObjectURL(modelFile.url));
        return;
      }

      activeUrls = nextUrls;
      setModelObjectUrls(
        nextUrls.filter((modelFile) => modelFile.id === config.buildingModelFileId),
      );
      setLogoObjectUrl(
        nextUrls.find((modelFile) => modelFile.id === config.logoFileId)?.url || "",
      );
      const hasMissingBuildingModel =
        Boolean(config.buildingModelFileId) &&
        !nextUrls.some((modelFile) => modelFile.id === config.buildingModelFileId);
      const hasMissingLogo =
        Boolean(config.logoFileId) &&
        !nextUrls.some((modelFile) => modelFile.id === config.logoFileId);
      setModelAssetStatus(hasMissingBuildingModel ? "missing" : "ready");
      setLogoAssetStatus(hasMissingLogo ? "missing" : "ready");
    }

    loadModelUrls();

    return () => {
      isCancelled = true;
      activeUrls.forEach((modelFile) => URL.revokeObjectURL(modelFile.url));
    };
  }, [config.buildingModelFileId, config.logoFileId, config.modelFiles]);

  const resolvedModelPaths = useMemo(
    () =>
      config.buildingModelFileId
        ? modelObjectUrls.map((modelFile) => modelFile.url)
        : config.modelPaths,
    [config.buildingModelFileId, config.modelPaths, modelObjectUrls],
  );

  const saveConfig = useCallback((nextConfig) => {
    const value =
      typeof nextConfig === "function" ? nextConfig(config) : nextConfig;
    const result = saveNavigatorConfig(value);
    if (result !== false) {
      setConfig(result);
    }
    return result !== false;
  }, [config]);

  const resetConfig = useCallback(() => {
    setConfig(resetNavigatorConfig());
  }, []);

  const storeModelFiles = useCallback(async (files, options = {}) => {
    const savedFiles = [];

    for (const file of files) {
      savedFiles.push(await saveModelFile(file));
    }

    if (savedFiles.length > 0) {
      setConfig((currentConfig) => {
        const result = saveNavigatorConfig({
          ...currentConfig,
          modelFiles: [
            ...currentConfig.modelFiles.filter(
              (modelFile) => modelFile.id !== options.replaceFileId,
            ),
            ...savedFiles,
          ],
          ...(options.buildingModel && savedFiles[0]
            ? { buildingModelFileId: savedFiles[0].id }
            : {}),
          ...(options.logo && savedFiles[0]
            ? { logoFileId: savedFiles[0].id }
            : {}),
          ...(options.buildingModel && options.modelGroupNames
            ? { modelGroupNames: options.modelGroupNames }
            : {}),
        });
        return result === false ? currentConfig : result;
      });
      if (options.replaceFileId) {
        await deleteModelFile(options.replaceFileId);
      }
    }

    return savedFiles;
  }, []);

  const removeModelFile = useCallback(async (fileId) => {
    await deleteModelFile(fileId);
    setConfig((currentConfig) => {
      const result = saveNavigatorConfig({
        ...currentConfig,
        modelFiles: currentConfig.modelFiles.filter(
          (modelFile) => modelFile.id !== fileId,
        ),
        buildingModelFileId:
          currentConfig.buildingModelFileId === fileId
            ? ""
            : currentConfig.buildingModelFileId,
        logoFileId: currentConfig.logoFileId === fileId ? "" : currentConfig.logoFileId,
      });
      return result === false ? currentConfig : result;
    });
  }, []);

  return {
    config,
    modelAssetStatus,
    logoAssetStatus,
    modelObjectUrls,
    resolvedModelPaths,
    resolvedLogoUrl: logoObjectUrl,
    saveConfig,
    resetConfig,
    storeModelFiles,
    removeModelFile,
  };
}
