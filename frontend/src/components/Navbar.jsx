"use client"

import { useContext } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AuthContext } from "../context/AuthContext"
import ThemeToggle from "./ThemeToggle"

export default function Navbar() {
  const { token, role, logout } = useContext(AuthContext)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  if (!token) return null

  return (
    <nav>
      <div>
        <strong style={{ marginRight: "2rem" }}>Monitor Kendala</strong>
        {role === "admin" ? (
          <>
            <Link to="/admin">Dashboard</Link>
            <Link to="/admin/create">Buat Kendala ATM/CRM</Link>
          </>
        ) : (
          <Link to="/user">Kendala Saya</Link>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <ThemeToggle />
        <button onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  )
}