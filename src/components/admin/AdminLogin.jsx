import { useState } from "react";
import { Lock } from "lucide-react";
import { unlockAdmin, isAdminUnlocked } from "../../services/navigatorConfig.js";

export default function AdminLogin({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (isAdminUnlocked()) {
    onUnlock();
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedPin = pin.trim();

    if (!trimmedPin) {
      setError("Enter an access code.");
      return;
    }

    if (await unlockAdmin(trimmedPin)) {
      onUnlock();
    } else {
      setError("Incorrect access code.");
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-icon">
          <Lock size={28} />
        </div>
        <h2>Admin Access</h2>
        <p>Enter the access code to manage the navigator.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError("");
            }}
            placeholder="Access code"
            autoFocus
          />
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" className="admin-login-btn">Unlock</button>
        </form>
      </div>
    </div>
  );
}
