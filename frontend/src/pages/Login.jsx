"use client"

import { useContext, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "../api/axios"
import { AuthContext } from "../context/AuthContext"

export default function Login() {
  const { login } = useContext(AuthContext)
  const [form, setForm] = useState({ username: "", password: "" })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const formData = new URLSearchParams()
    formData.append("username", form.username)
    formData.append("password", form.password)

    try {
      const res = await axios.post("/auth/login", formData)
      login(res.data.access_token, res.data.role)
      navigate(res.data.role === "admin" ? "/admin" : "/user")
    } catch (err) {
      alert("Password atau Username salah. Silahkan coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2>Login</h2>
        <p className="text-muted text-center" style={{ marginBottom: "2rem" }}>
          Akses dashboard untuk pengelolaan Kendala ATM & CRM
        </p>

        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            placeholder="Masukan username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Masukan password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Memasukan anda.." : "login"}
        </button>
      </form>
    </div>
  )
}