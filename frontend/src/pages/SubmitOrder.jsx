"use client"

import { useParams, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import axios from "../api/axios"

export default function SubmitOrder() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await axios.get("/users/orders")
        const found = res.data.find((o) => o.id === Number.parseInt(orderId))
        if (!found) {
          setMessage("Kendala tidak dapat ditemukan atau diakses")
        } else {
          setOrder(found)
        }
      } catch (err) {
        setMessage("gagas dalam mengambil detail kendala.")
      }
    }
    fetchOrder()
  }, [orderId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setMessage("Silahkan pilih file untuk diajukan.")
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      await axios.post(`/users/orders/${orderId}/submit`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setMessage("File berhasil diajukan!")
      setTimeout(() => navigate("/user"), 2000)
    } catch (err) {
      setMessage("gagak untuk mengajukan file. silahkan coba kembali.")
    } finally {
      setLoading(false)
    }
  }

  if (message && !order) {
    return (
      <div className="page-container">
        <div className="card text-center">
          <h2>Submission Status</h2>
          <div
            className={`alert ${message.includes("Error") || message.includes("not found") ? "alert-error" : "alert-info"}`}
          >
            {message}
          </div>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="page-container">
        <div className="loading">Loading detail kendala...</div>
      </div>
    )
  }

  if (order.state !== "pending" && order.state !== "overdue") {
    return (
      <div className="page-container">
        <div className="card text-center">
          <h2>Order Status: {order.state}</h2>
          <div className="alert alert-info">Kendala ini tidak lagi mengambil file ajuan.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="action-bar">
        <div>
          <h1>Ajukan file</h1>
          <p className="subtitle">Ajukan file bukti kendala sudah beres</p>
        </div>
      </div>

      <div className="card">
        <div className="order-info-box">
          <h3 style={{ marginBottom: "0.5rem" }}>{order.title}</h3>
          <p style={{ color: "#64748b", margin: "0" }}>{order.description}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>TOLONG BERIKAN NAMA FILE DENGAN FORMAT NAMA_PENGURUS/KENDALA/TID/WILAYAH</label>
            <div className={`file-upload ${file ? "has-file" : ""}`}>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} required />
              <div className="file-upload-label">
                {file ? (
                  <div>
                    <strong>{file.name}</strong>
                    <br />
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong>Click untuk memilih file</strong>
                    <br />
                    <span style={{ fontSize: "0.75rem" }}>Formats: JPG, PNG, GIF</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button type="submit" disabled={!file || loading}>
              {loading ? "Submitting..." : "Ajukan Bukti"}
            </button>
            <button type="button" className="secondary" onClick={() => navigate("/user")}>
              Cancel
            </button>
          </div>
        </form>

        {message && (
          <div className={`alert ${message.includes("success") ? "alert-success" : "alert-error"}`}>{message}</div>
        )}
      </div>
    </div>
  )
}