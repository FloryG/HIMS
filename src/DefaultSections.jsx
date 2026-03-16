// src/DefaultSections.jsx
import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const SECTIONS = ["Fridge","Freezer","Storage","Bathroom","Spices","Cleaning","Alcohol"]

export default function DefaultSections({ user }) {
  const [defaults, setDefaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const fetchDefaults = async () => {
      setLoading(true)
      setError("")
      const { data, error } = await supabase
        .from("product_defaults")
        .select("*")
        .eq("user_id", user.id)
        .order("last_updated", { ascending: false })
      if (error) setError("Failed to load default sections.")
      else setDefaults(data || [])
      setLoading(false)
    }

    fetchDefaults()
  }, [user])

  const handleChangeSection = async (barcode, newSection) => {
    const { error } = await supabase
      .from("product_defaults")
      .upsert([
        {
          user_id: user.id,
          barcode,
          default_section: newSection,
          last_updated: new Date()
        }
      ])
    if (error) {
      console.error(error)
      setMessage("Failed to update section.")
    } else {
      setDefaults(prev =>
        prev.map(d => d.barcode === barcode ? { ...d, default_section: newSection } : d)
      )
      setMessage("✅ Section updated!")
    }
  }

  if (loading) return <p>Loading default sections...</p>
  if (error) return <p style={{ color: "red" }}>{error}</p>
  if (!defaults.length) return <p>No default sections yet. Scan some products!</p>

  return (
    <div style={{ padding: "1rem" }}>
      <h2>⚙ Default Sections</h2>
      {message && <p style={{ color: "green" }}>{message}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: "0.5rem" }}>Barcode</th>
            <th style={{ padding: "0.5rem" }}>Default Section</th>
          </tr>
        </thead>
        <tbody>
          {defaults.map(d => (
            <tr key={d.barcode} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "0.5rem" }}>{d.barcode}</td>
              <td style={{ padding: "0.5rem" }}>
                <select
                  value={d.default_section}
                  onChange={(e) => handleChangeSection(d.barcode, e.target.value)}
                >
                  {SECTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}