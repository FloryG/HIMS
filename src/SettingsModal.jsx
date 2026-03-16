// src/SettingsModal.jsx
import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

export default function SettingsModal({ user, onClose }) {
  const [darkMode, setDarkMode] = useState(false)
  const [autoMailer, setAutoMailer] = useState(false)
  const [name, setName] = useState("")

  // Fetch profile & settings
  useEffect(() => {
    const fetchSettings = async () => {
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle()

      if (!profileError && profileData) setName(profileData.name)

      // Get user settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("dark_mode, auto_mailer")
        .eq("user_id", user.id)
        .single()

      if (!settingsError && settingsData) {
        setDarkMode(settingsData.dark_mode || false)
        setAutoMailer(settingsData.auto_mailer || false)
      }
    }

    fetchSettings()
  }, [user.id])

  // Update setting automatically
  const updateSetting = async (field, value) => {
    if (field === "dark_mode") setDarkMode(value)
    if (field === "auto_mailer") setAutoMailer(value)

    const { error } = await supabase
      .from("user_settings")
      .upsert([{ user_id: user.id, [field]: value }])
    if (error) console.error("Failed to update setting:", error)
  }

  // iPhone-style toggle
  const Toggle = ({ checked, onChange }) => (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: "50px",
        height: "28px",
        borderRadius: "14px",
        backgroundColor: checked ? "#4cd137" : "#ccc",
        position: "relative",
        cursor: "pointer",
        transition: "background-color 0.3s"
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          backgroundColor: "#fff",
          position: "absolute",
          top: "2px",
          left: checked ? "24px" : "2px",
          transition: "left 0.3s"
        }}
      />
    </div>
  )

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          padding: "2rem",
          borderRadius: "10px",
          minWidth: "300px",
          maxWidth: "400px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>⚙️ Settings</h2>
        <p><strong>User:</strong> {name || user.email}</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span>Dark Mode</span>
          <Toggle checked={darkMode} onChange={(val) => updateSetting("dark_mode", val)} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span>Auto Mailer</span>
          <Toggle checked={autoMailer} onChange={(val) => updateSetting("auto_mailer", val)} />
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1rem",
            border: "none",
            borderRadius: "5px",
            backgroundColor: "#007bff",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
