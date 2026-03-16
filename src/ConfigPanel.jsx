import { useState, useEffect } from "react"
import { supabase } from "./supabaseClient"

export default function ConfigPanel({ user }) {
  const [darkMode, setDarkMode] = useState(false)
  const [autoMailer, setAutoMailer] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single()
      if (data) {
        setDarkMode(data.dark_mode)
        setAutoMailer(data.auto_mailer)
      }
      setLoading(false)
    }
    fetchSettings()
  }, [user])

  const handleSaveSettings = async () => {
    await supabase.from("user_settings").upsert([
      { user_id: user.id, dark_mode: darkMode, auto_mailer: autoMailer }
    ])
    alert("Settings saved!")
  }

  if (loading) return null

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Settings</h2>

      <label>
        <input
          type="checkbox"
          checked={darkMode}
          onChange={(e) => setDarkMode(e.target.checked)}
        />{" "}
        Dark Mode
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={autoMailer}
          onChange={(e) => setAutoMailer(e.target.checked)}
        />{" "}
        Auto Mailer
      </label>
      <br />
      <button onClick={handleSaveSettings}>💾 Save Settings</button>
      <br /><br />
      <button onClick={() => window.location.href = "/default-sections"}>
        Manage Default Sections
      </button>
    </div>
  )
}