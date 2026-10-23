import { useEffect, useState } from "react";
import {
  Building2,
  Globe,
  ImagePlus,
  Palette,
  Trash2,
  Upload,
} from "lucide-react";
import useNavigatorConfig from "../../hooks/useNavigatorConfig.js";
import { updateMunicipalityConfig } from "../../services/navigatorConfig.js";

const ORGANIZATION_TYPES = [
  "City Government",
  "Municipality",
  "Barangay",
  "Provincial Government",
  "Public Agency",
  "Other",
];

function createForm(config) {
  return {
    cityName: config.cityName,
    organizationType: config.organizationType,
    organizationName: config.organizationName,
    address: config.address,
    city: config.city,
    province: config.province,
    country: config.country,
    phone: config.phone,
    email: config.email,
    website: config.website,
    navigatorTitle: config.navigatorTitle,
    landingKicker: config.landingKicker,
    landingTagline: config.landingTagline,
    brandColor: config.brandColor || "#238b67",
  };
}

export default function AdminMunicipality() {
  const {
    config,
    modelAssetStatus,
    logoAssetStatus,
    resolvedLogoUrl,
    saveConfig,
    storeModelFiles,
    removeModelFile,
  } = useNavigatorConfig();
  const [form, setForm] = useState(() => createForm(config));
  const [saved, setSaved] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setForm(createForm(config));
  }, [config]);

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setSaved(false);
    setFormError("");
  };

  const handleSave = () => {
    if (!form.organizationName.trim()) {
      setFormError("Enter an organization name before saving.");
      return;
    }
    if (!/^#[0-9a-f]{6}$/i.test(form.brandColor)) {
      setFormError("Enter a valid six-digit hex color.");
      return;
    }
    const next = updateMunicipalityConfig(config, {
      ...form,
      cityName: form.organizationName,
    });
    if (!saveConfig(next)) {
      setFormError("Unable to save. Storage may be full or unavailable.");
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const handleBuildingModel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError("");
    setIsUploadingModel(true);
    try {
      const { inspectGlbFloorGroups } = await import(
        "../../services/modelGroups.js"
      );
      const modelGroupNames = await inspectGlbFloorGroups(file);
      await storeModelFiles([file], {
        buildingModel: true,
        modelGroupNames,
        replaceFileId: config.buildingModelFileId || "",
      });
    } catch (error) {
      setUploadError(error.message || "The building model could not be read.");
    } finally {
      setIsUploadingModel(false);
    }
  };

  const handleLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedTypes = new Map([
      ["png", "image/png"],
      ["jpg", "image/jpeg"],
      ["jpeg", "image/jpeg"],
      ["webp", "image/webp"],
    ]);
    const expectedType = allowedTypes.get(extension);
    if (
      !expectedType ||
      (file.type && file.type !== expectedType) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      setUploadError("Choose a PNG, JPG, or WebP logo under 5 MB.");
      return;
    }

    setUploadError("");
    setIsUploadingLogo(true);
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const signatureValid =
        extension === "png"
          ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
              (byte, index) => bytes[index] === byte,
            )
          : extension === "jpg" || extension === "jpeg"
            ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!signatureValid) {
        throw new Error("The selected file content does not match a supported image format.");
      }
      await storeModelFiles([file], {
        logo: true,
        replaceFileId: config.logoFileId || "",
      });
    } catch (error) {
      setUploadError(error.message || "The organization logo could not be saved.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveAsset = async (fileId) => {
    if (!fileId) return;
    setUploadError("");
    try {
      await removeModelFile(fileId);
    } catch (error) {
      setUploadError(error.message || "The selected file could not be removed.");
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Organization Settings</h1>
          <p className="admin-page-subtitle">
            Organization details, visual identity, and the shared building model.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode-badge edit">Edit Mode</span>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-body">
          <h2 className="admin-section-title">
            <Building2 size={18} aria-hidden="true" /> Organization
          </h2>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label htmlFor="organization-type">Organization type</label>
              <select
                id="organization-type"
                value={form.organizationType}
                onChange={(event) => updateField("organizationType", event.target.value)}
              >
                {ORGANIZATION_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-name">Organization name</label>
              <input
                id="organization-name"
                value={form.organizationName}
                onChange={(event) => updateField("organizationName", event.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-address">Street address</label>
              <input
                id="organization-address"
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                maxLength={200}
                autoComplete="street-address"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-city">City / locality</label>
              <input
                id="organization-city"
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                maxLength={100}
                autoComplete="address-level2"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-province">State / province</label>
              <input
                id="organization-province"
                value={form.province}
                onChange={(event) => updateField("province", event.target.value)}
                maxLength={100}
                autoComplete="address-level1"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-country">Country</label>
              <input
                id="organization-country"
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                maxLength={100}
                autoComplete="country-name"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-phone">Contact phone</label>
              <input
                id="organization-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                maxLength={40}
                autoComplete="tel"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-email">Contact email</label>
              <input
                id="organization-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={254}
                autoComplete="email"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="organization-website">Website</label>
              <input
                id="organization-website"
                type="url"
                value={form.website}
                onChange={(event) => updateField("website", event.target.value)}
                maxLength={250}
                placeholder="https://example.gov"
                autoComplete="url"
              />
            </div>
          </div>

          <div className="admin-form-group admin-organization-logo">
            <label htmlFor="organization-logo">Organization logo</label>
            {resolvedLogoUrl ? (
              <img className="admin-logo-preview" src={resolvedLogoUrl} alt="Organization logo preview" />
            ) : (
              <span className="admin-logo-empty">No custom logo selected</span>
            )}
            <div className="admin-header-actions">
              <label className="admin-btn admin-btn-secondary" htmlFor="organization-logo">
                <ImagePlus size={16} aria-hidden="true" />
                {config.logoFileId ? "Replace logo" : "Upload logo"}
              </label>
              {config.logoFileId ? (
                <button
                  className="admin-btn admin-btn-secondary"
                  type="button"
                  onClick={() => handleRemoveAsset(config.logoFileId)}
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </button>
              ) : null}
              {isUploadingLogo ? <span role="status">Saving logo...</span> : null}
            </div>
            <input
              id="organization-logo"
              className="visually-hidden"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleLogo}
            />
            <small>PNG, JPG, or WebP only. SVG is not accepted. Maximum 5 MB.</small>
            {logoAssetStatus === "missing" ? (
              <p className="admin-inline-error" role="alert">The saved logo file is missing; upload it again.</p>
            ) : null}
          </div>

          <h2 className="admin-section-title">
            <Globe size={18} aria-hidden="true" /> Navigator branding
          </h2>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label htmlFor="navigator-title">Navigator title</label>
              <input
                id="navigator-title"
                value={form.navigatorTitle}
                onChange={(event) => updateField("navigatorTitle", event.target.value)}
                maxLength={120}
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="landing-kicker">Landing kicker</label>
              <input
                id="landing-kicker"
                value={form.landingKicker}
                onChange={(event) => updateField("landingKicker", event.target.value)}
                maxLength={120}
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="landing-tagline">Landing tagline</label>
              <textarea
                id="landing-tagline"
                value={form.landingTagline}
                onChange={(event) => updateField("landingTagline", event.target.value)}
                maxLength={300}
                rows={3}
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="brand-color">
                <Palette size={16} aria-hidden="true" /> Brand color
              </label>
              <div className="admin-brand-color">
                <input
                  id="brand-color"
                  type="color"
                  value={form.brandColor}
                  onChange={(event) => updateField("brandColor", event.target.value)}
                  aria-label="Choose brand color"
                />
                <input
                  type="text"
                  value={form.brandColor}
                  onChange={(event) => updateField("brandColor", event.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  aria-label="Brand color hex value"
                />
                <button
                  className="admin-btn admin-btn-secondary"
                  type="button"
                  onClick={() => updateField("brandColor", "#238b67")}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <h2 className="admin-section-title">
            <Upload size={18} aria-hidden="true" /> Building model
          </h2>
          <div className="admin-model-upload">
            <div>
              <strong>{config.modelFiles.find((file) => file.id === config.buildingModelFileId)?.name || "No uploaded GLB selected"}</strong>
              <p>
                One complete binary GLB is shared by all floors. Named hierarchy groups can be assigned per floor.
                {config.buildingModelFileId
                  ? ` ${config.modelGroupNames.length} named groups detected.`
                  : ""}
              </p>
            </div>
            <label className="admin-btn admin-btn-secondary" htmlFor="building-model-file">
              <Upload size={16} aria-hidden="true" />
              {config.buildingModelFileId ? "Replace GLB" : "Upload GLB"}
            </label>
            {config.buildingModelFileId ? (
              <button
                className="admin-btn admin-btn-secondary"
                type="button"
                onClick={() => handleRemoveAsset(config.buildingModelFileId)}
              >
                <Trash2 size={16} aria-hidden="true" /> Remove
              </button>
            ) : null}
            {isUploadingModel ? <span role="status">Inspecting GLB...</span> : null}
          </div>
          <input
            id="building-model-file"
            className="visually-hidden"
            type="file"
            accept=".glb,model/gltf-binary"
            onChange={handleBuildingModel}
          />
          <small>
            Binary GLB only, maximum 100 MB. Upload replaces the selected building file; floor groups are managed under Floors.
          </small>
          {modelAssetStatus === "missing" ? (
            <p className="admin-inline-error" role="alert">The selected GLB is missing from this browser; upload it again.</p>
          ) : null}

          {uploadError ? <p className="admin-inline-error" role="alert">{uploadError}</p> : null}
          {formError ? <p className="admin-inline-error" role="alert">{formError}</p> : null}
          <div className="admin-local-storage-note">
            Files and settings are stored in this browser only. This is not a secure multi-user publishing system.
          </div>

          <div className="admin-modal-footer">
            {saved ? (
              <span className="admin-toast success" style={{ marginRight: "auto" }}>
                Saved successfully
              </span>
            ) : null}
            <button className="admin-btn admin-btn-primary" onClick={handleSave} type="button">
              <Globe size={16} aria-hidden="true" /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
