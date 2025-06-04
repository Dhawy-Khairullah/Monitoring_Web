"use client"

import { useEffect, useState, useContext } from "react"
import axios from "../api/axios"
import { AuthContext } from "../context/AuthContext"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

export default function AdminDashboard() {
  const { logout } = useContext(AuthContext)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [bulkFile, setBulkFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [selectedTidData, setSelectedTidData] = useState(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("newest")
  const [dateFilter, setDateFilter] = useState("all")

  const currentYear = new Date().getFullYear();
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Pagination state for frequent TIDs
  const [tidCurrentPage, setTidCurrentPage] = useState(1)
  const tidItemsPerPage = 8

  // Add pagination state for filteredOrders table
  // Add these lines after the existing pagination state for TIDs
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(1)
  const ordersPerPage = 10

  const exportToExcel = () => {
    // Map the filteredOrders to a flat array of objects for Excel export
    const exportData = orders.map((order) => ({
      ID: order.id,
      TID: order.reference_data?.tid || "—",
      Lokasi: order.reference_data?.lokasi || "—",
      KC_Supervisi: order.reference_data?.kc_supervisi || "—",
      Pengelola: order.username,
      Judul: order.title,
      Deskripsi: order.description,
      Status: translateStatus(order.state),
      Dibuat: new Date(order.created_at).toLocaleString(),
      Hasil_Submit: order.image_url ? order.image_url : "Kosong",
      Diselesaikan: order.completed_at ? new Date(order.completed_at).toLocaleString() : "—",
      Deadline: (() => {
        if (order.overdue_duration) return order.overdue_duration
        if (order.state === "completed") {
          const createdAt = new Date(order.created_at)
          const deadline = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
          const completedAt = new Date(order.completed_at)
          return completedAt <= deadline ? "Sesuai deadline" : "Melewati deadline"
        } else if (order.state === "pending" || order.state === "overdue") {
          const createdAt = new Date(order.created_at)
          const deadline = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
          const now = new Date()
          const diff = deadline - now
          if (diff > 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            return `sisa ${hours} jam ${minutes} menit`
          } else {
            const overdueMillis = Math.abs(diff)
            const hours = Math.floor(overdueMillis / (1000 * 60 * 60))
            const minutes = Math.floor((overdueMillis % (1000 * 60 * 60)) / (1000 * 60))
            return `lewat ${hours} jam ${minutes} menit`
          }
        }
        return "—"
      })(),
    }))

    // Create a new workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kendala")

    // Write workbook to binary string
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

    // Save file
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "kendala_export.xlsx")
  }

  // Function to find TIDs that appear more than 2 times in a single month
  const getFrequentTids = () => {
    const monthlyTidCounts = {}

    orders.forEach((order) => {
      if (!order.reference_data?.tid) return

      const orderDate = new Date(order.created_at)
      const monthKey = `${orderDate.getFullYear()}-${orderDate.getMonth()}`
      const tid = order.reference_data.tid

      if (!monthlyTidCounts[monthKey]) {
        monthlyTidCounts[monthKey] = {}
      }

      if (!monthlyTidCounts[monthKey][tid]) {
        monthlyTidCounts[monthKey][tid] = []
      }

      monthlyTidCounts[monthKey][tid].push(order)
    })

    const frequentTids = []
    Object.entries(monthlyTidCounts).forEach(([monthKey, tidCounts]) => {
      Object.entries(tidCounts).forEach(([tid, orderList]) => {
        if (orderList.length > 2) {
          const [year, month] = monthKey.split("-")
          const monthName = new Date(Number.parseInt(year), Number.parseInt(month)).toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
          })
          frequentTids.push({
            tid,
            count: orderList.length,
            monthKey,
            monthName,
            orders: orderList,
          })
        }
      })
    })

    return frequentTids.sort((a, b) => b.count - a.count)
  }

  // Function to generate daily data for line chart
  const generateDailyData = (orders, monthKey) => {
    const [year, month] = monthKey.split("-")
    const daysInMonth = new Date(Number.parseInt(year), Number.parseInt(month) + 1, 0).getDate()
    const dailyCounts = Array(daysInMonth).fill(0)

    orders.forEach((order) => {
      const orderDate = new Date(order.created_at)
      const day = orderDate.getDate() - 1 // 0-indexed
      dailyCounts[day]++
    })

    return dailyCounts.map((count, index) => ({
      day: index + 1,
      count,
    }))
  }

  // Function to get TID information from orders
  const getTidInfo = (orders) => {
    if (orders.length === 0) return null

    // Get info from the first order (they should all have the same TID info)
    const firstOrder = orders[0]
    const pengelola = [...new Set(orders.map((order) => order.username))].join(", ")

    return {
      lokasi: firstOrder.reference_data?.lokasi || "—",
      pengelola: pengelola || "—",
      kc_supervisi: firstOrder.reference_data?.kc_supervisi || "—",
    }
  }

  // Replace the LineChart component with this improved version
  const LineChart = ({ data, tid, monthName, orders }) => {
    const maxCount = Math.max(...data.map((d) => d.count), 1)
    const chartWidth = 600
    const chartHeight = 250
    const padding = 50

    const xScale = (day) => ((day - 1) / (data.length - 1)) * (chartWidth - 2 * padding) + padding
    const yScale = (count) => chartHeight - padding - (count / maxCount) * (chartHeight - 2 * padding)

    // Create path data only for points with occurrences (count > 0)
    const pointsWithOccurrences = data.filter((d) => d.count > 0)
    const pathData = pointsWithOccurrences
      .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(d.day)} ${yScale(d.count)}`)
      .join(" ")

    // Find days with occurrences to label on x-axis
    const daysWithOccurrences = data.filter((d) => d.count > 0).map((d) => d.day)

    // Get TID information
    const tidInfo = getTidInfo(orders)

    return (
      <div
        style={{
          marginTop: "1rem",
          padding: "1.5rem",
          border: "1px solid var(--border-primary)",
          borderRadius: "8px",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
            TID: {tid} - {monthName}
          </h4>
          {tidInfo && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                padding: "0.75rem",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: "6px",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <div>
                <strong>Lokasi:</strong> {tidInfo.lokasi}
              </div>
              <div>
                <strong>Pengelola:</strong> {tidInfo.pengelola}
              </div>
              <div>
                <strong>KC Supervisi:</strong> {tidInfo.kc_supervisi}
              </div>
            </div>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <svg width={chartWidth} height={chartHeight}>
            {/* Background grid */}
            {Array.from({ length: 6 }).map((_, i) => (
              <line
                key={`grid-y-${i}`}
                x1={padding}
                y1={padding + (i * (chartHeight - 2 * padding)) / 5}
                x2={chartWidth - padding}
                y2={padding + (i * (chartHeight - 2 * padding)) / 5}
                stroke="var(--border-secondary)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            ))}

            {/* Vertical grid lines only for days with occurrences */}
            {daysWithOccurrences.map((day) => (
              <line
                key={`grid-x-${day}`}
                x1={xScale(day)}
                y1={padding}
                x2={xScale(day)}
                y2={chartHeight - padding}
                stroke="var(--border-secondary)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            ))}

            {/* X-axis */}
            <line
              x1={padding}
              y1={chartHeight - padding}
              x2={chartWidth - padding}
              y2={chartHeight - padding}
              stroke="var(--text-secondary)"
              strokeWidth="2"
            />

            {/* Y-axis */}
            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={chartHeight - padding}
              stroke="var(--text-secondary)"
              strokeWidth="2"
            />

            {/* X-axis labels - only show dates with occurrences */}
            {daysWithOccurrences.map((day) => (
              <g key={`x-label-${day}`}>
                <line
                  x1={xScale(day)}
                  y1={chartHeight - padding}
                  x2={xScale(day)}
                  y2={chartHeight - padding + 5}
                  stroke="var(--text-secondary)"
                  strokeWidth="2"
                />
                <text
                  x={xScale(day)}
                  y={chartHeight - padding + 20}
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {day}
                </text>
              </g>
            ))}

            {/* X-axis title */}
            <text
              x={chartWidth / 2}
              y={chartHeight - 10}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize="14"
            >
              Tanggal
            </text>

            {/* Line connecting only points with occurrences */}
            {pointsWithOccurrences.length > 1 && (
              <path
                d={pathData}
                fill="none"
                stroke="var(--info)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data points - only show points with occurrences */}
            {pointsWithOccurrences.map((d) => (
              <g key={`point-${d.day}`}>
                <circle
                  cx={xScale(d.day)}
                  cy={yScale(d.count)}
                  r="6"
                  fill="var(--info)"
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={xScale(d.day)}
                  y={yScale(d.count) - 10}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {d.count}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Total kejadian: {data.reduce((sum, d) => sum + d.count, 0)} kali dalam bulan {monthName}
          </p>
          <button onClick={() => setSelectedTidData(null)} style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}>
            Tutup Grafik
          </button>
        </div>
      </div>
    )
  }

  const filteredOrders = orders
    .filter((order) => {
      // Search filter
      const matchSearch =
        order.title.toLowerCase().includes(search.toLowerCase()) ||
        order.description.toLowerCase().includes(search.toLowerCase()) ||
        (order.reference_data?.tid || "").toLowerCase().includes(search.toLowerCase()) ||
        (order.reference_data?.lokasi || "").toLowerCase().includes(search.toLowerCase()) ||
        (order.reference_data?.pengelola || "").toLowerCase().replace(/\s+/g, "").includes(search.toLowerCase().replace(/\s+/g, ""))

      // Status filter
      const matchStatus = statusFilter === "all" || order.state === statusFilter

      // Date filter
      let matchDate = true
      if (dateFilter !== "all") {
        const orderDate = new Date(order.created_at)
        const orderYear = orderDate.getFullYear()
        const orderMonth = orderDate.getMonth() // 0-11
        const currentYear = new Date().getFullYear();

        // Only show orders from this year
        if (orderYear === currentYear) {
          const selectedMonth = Number.parseInt(dateFilter) // 0-11
          matchDate = orderMonth === selectedMonth
        } else {
          matchDate = false
        }
      }

      return matchSearch && matchStatus && matchDate
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at) - new Date(a.created_at)
        case "oldest":
          return new Date(a.created_at) - new Date(b.created_at)
        case "title":
          return a.title.localeCompare(b.title)
        case "status":
          return a.state.localeCompare(b.state)
        case "deadline":
          // Sort by time remaining (pending/overdue first, then by urgency)
          const getDeadlinePriority = (order) => {
            if (order.state === "completed" || order.state === "completed but overdue") return 3
            const created = new Date(order.created_at)
            const deadline = new Date(created.getTime() + 2 * 60 * 60 * 1000)
            const now = new Date()
            const timeLeft = deadline - now
            if (timeLeft <= 0) return 1 // Overdue - highest priority
            return 2 // Pending - medium priority
          }
          const priorityA = getDeadlinePriority(a)
          const priorityB = getDeadlinePriority(b)
          if (priorityA !== priorityB) return priorityA - priorityB
          // If same priority, sort by time remaining
          const createdA = new Date(a.created_at)
          const createdB = new Date(b.created_at)
          const deadlineA = new Date(createdA.getTime() + 2 * 60 * 60 * 1000)
          const deadlineB = new Date(createdB.getTime() + 2 * 60 * 60 * 1000)
          return deadlineA - deadlineB
        default:
          return 0
      }
    })

  // Add this after the filteredOrders definition but before the translateStatus function
  // Calculate pagination for orders table
  const ordersTotalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const ordersStartIndex = (ordersCurrentPage - 1) * ordersPerPage
  const ordersEndIndex = ordersStartIndex + ordersPerPage
  const currentPageOrders = filteredOrders.slice(ordersStartIndex, ordersEndIndex)

  const translateStatus = (state) => {
    switch (state.toLowerCase().replace(/\s+/g, "_")) {
      case "pending":
        return "Proses"
      case "completed":
        return "Selesai"
      case "overdue":
        return "Melewati Deadline"
      case "completed_but_overdue":
        return "Selesai Terlambat"
      default:
        return state
    }
  }

  const fetchOrders = async () => {
    try {
      const res = await axios.get("/admin/orders")
      setOrders(res.data)
    } catch (err) {
      if (err.response?.status === 401) logout()
      else alert("Failed to fetch orders")
    } finally {
      setLoading(false)
    }
  }

  const deleteOrder = async (id) => {
    if (!confirm("Apa anda yakin untuk menghapus kendala ini?")) return
    try {
      await axios.delete(`/admin/orders/${id}`)
      setOrders((prev) => prev.filter((order) => order.id !== id))
    } catch (err) {
      alert("kendala gagal untuk dihapus.")
    }
  }

  const handleBulkUpload = async (e) => {
    e.preventDefault()
    if (!bulkFile) return alert("Pilih file Excel terlebih dahulu")

    setUploading(true)
    const formData = new FormData()
    formData.append("file", bulkFile)

    try {
      const res = await axios.post("/admin/orders/bulk-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      alert(res.data.detail)
      setBulkFile(null)
      fetchOrders() // Refresh orders
    } catch (err) {
      alert("Bulk upload gagal: " + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const isCompletedButOverdue = (state) => state === "completed but overdue"

  const getStats = () => {
    const total = orders.length
    const pending = orders.filter((o) => o.state === "pending").length
    const completed = orders.filter((o) => o.state === "completed").length
    const overdue = orders.filter((o) => o.state === "overdue").length
    const completed_but_overdue = orders.filter((o) => o.state === "completed but overdue").length
    return { total, pending, completed, overdue, completed_but_overdue }
  }

  // Pagination for frequent TIDs
  const frequentTids = getFrequentTids()
  const tidTotalPages = Math.ceil(frequentTids.length / tidItemsPerPage)
  const tidStartIndex = (tidCurrentPage - 1) * tidItemsPerPage
  const tidEndIndex = tidStartIndex + tidItemsPerPage
  const currentTids = frequentTids.slice(tidStartIndex, tidEndIndex)

  // TID Pagination component
  const TidPagination = () => {
    if (tidTotalPages <= 1) return null

    const getPageNumbers = () => {
      const pages = []
      const maxVisiblePages = 5

      if (tidTotalPages <= maxVisiblePages) {
        for (let i = 1; i <= tidTotalPages; i++) {
          pages.push(i)
        }
      } else {
        if (tidCurrentPage <= 3) {
          for (let i = 1; i <= 4; i++) {
            pages.push(i)
          }
          pages.push("...")
          pages.push(tidTotalPages)
        } else if (tidCurrentPage >= tidTotalPages - 2) {
          pages.push(1)
          pages.push("...")
          for (let i = tidTotalPages - 3; i <= tidTotalPages; i++) {
            pages.push(i)
          }
        } else {
          pages.push(1)
          pages.push("...")
          for (let i = tidCurrentPage - 1; i <= tidCurrentPage + 1; i++) {
            pages.push(i)
          }
          pages.push("...")
          pages.push(tidTotalPages)
        }
      }

      return pages
    }

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setTidCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={tidCurrentPage === 1}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            border: "1px solid var(--border-primary)",
            backgroundColor: tidCurrentPage === 1 ? "var(--bg-secondary)" : "var(--bg-primary)",
            color: tidCurrentPage === 1 ? "var(--text-muted)" : "var(--text-primary)",
            cursor: tidCurrentPage === 1 ? "not-allowed" : "pointer",
            borderRadius: "4px",
          }}
        >
          Sebelumnya
        </button>

        {getPageNumbers().map((page, index) =>
          page === "..." ? (
            <span key={index} style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
              ...
            </span>
          ) : (
            <button
              key={index}
              onClick={() => setTidCurrentPage(page)}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                border: "1px solid var(--border-primary)",
                backgroundColor: tidCurrentPage === page ? "var(--info)" : "var(--bg-primary)",
                color: tidCurrentPage === page ? "white" : "var(--text-primary)",
                cursor: "pointer",
                borderRadius: "4px",
                fontWeight: tidCurrentPage === page ? "bold" : "normal",
              }}
            >
              {page}
            </button>
          ),
        )}

        <button
          onClick={() => setTidCurrentPage((prev) => Math.min(prev + 1, tidTotalPages))}
          disabled={tidCurrentPage === tidTotalPages}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            border: "1px solid var(--border-primary)",
            backgroundColor: tidCurrentPage === tidTotalPages ? "var(--bg-secondary)" : "var(--bg-primary)",
            color: tidCurrentPage === tidTotalPages ? "var(--text-muted)" : "var(--text-primary)",
            cursor: tidCurrentPage === tidTotalPages ? "not-allowed" : "pointer",
            borderRadius: "4px",
          }}
        >
          Berikutnya
        </button>

        <div
          style={{
            marginLeft: "1rem",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>
            Tampil {tidStartIndex + 1}-{Math.min(tidEndIndex, frequentTids.length)} dari {frequentTids.length}
          </span>
        </div>
      </div>
    )
  }

  // Add this OrdersPagination component after the TidPagination component
  const OrdersPagination = () => {
    if (ordersTotalPages <= 1) return null

    const getPageNumbers = () => {
      const pages = []
      const maxVisiblePages = 5

      if (ordersTotalPages <= maxVisiblePages) {
        for (let i = 1; i <= ordersTotalPages; i++) {
          pages.push(i)
        }
      } else {
        if (ordersCurrentPage <= 3) {
          for (let i = 1; i <= 4; i++) {
            pages.push(i)
          }
          pages.push("...")
          pages.push(ordersTotalPages)
        } else if (ordersCurrentPage >= ordersTotalPages - 2) {
          pages.push(1)
          pages.push("...")
          for (let i = ordersTotalPages - 3; i <= ordersTotalPages; i++) {
            pages.push(i)
          }
        } else {
          pages.push(1)
          pages.push("...")
          for (let i = ordersCurrentPage - 1; i <= ordersCurrentPage + 1; i++) {
            pages.push(i)
          }
          pages.push("...")
          pages.push(ordersTotalPages)
        }
      }

      return pages
    }

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "1.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setOrdersCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={ordersCurrentPage === 1}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            border: "1px solid var(--border-primary)",
            backgroundColor: ordersCurrentPage === 1 ? "var(--bg-secondary)" : "var(--bg-primary)",
            color: ordersCurrentPage === 1 ? "var(--text-muted)" : "var(--text-primary)",
            cursor: ordersCurrentPage === 1 ? "not-allowed" : "pointer",
            borderRadius: "4px",
          }}
        >
          Sebelumnya
        </button>

        {getPageNumbers().map((page, index) =>
          page === "..." ? (
            <span key={index} style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
              ...
            </span>
          ) : (
            <button
              key={index}
              onClick={() => setOrdersCurrentPage(page)}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                border: "1px solid var(--border-primary)",
                backgroundColor: ordersCurrentPage === page ? "var(--info)" : "var(--bg-primary)",
                color: ordersCurrentPage === page ? "white" : "var(--text-primary)",
                cursor: "pointer",
                borderRadius: "4px",
                fontWeight: ordersCurrentPage === page ? "bold" : "normal",
              }}
            >
              {page}
            </button>
          ),
        )}

        <button
          onClick={() => setOrdersCurrentPage((prev) => Math.min(prev + 1, ordersTotalPages))}
          disabled={ordersCurrentPage === ordersTotalPages}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            border: "1px solid var(--border-primary)",
            backgroundColor: ordersCurrentPage === ordersTotalPages ? "var(--bg-secondary)" : "var(--bg-primary)",
            color: ordersCurrentPage === ordersTotalPages ? "var(--text-muted)" : "var(--text-primary)",
            cursor: ordersCurrentPage === ordersTotalPages ? "not-allowed" : "pointer",
            borderRadius: "4px",
          }}
        >
          Berikutnya
        </button>

        <div
          style={{
            marginLeft: "1rem",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>
            Tampil {ordersStartIndex + 1}-{Math.min(ordersEndIndex, filteredOrders.length)} dari {filteredOrders.length}
          </span>
        </div>
      </div>
    )
  }

  // Add this useEffect to reset pagination when filters change
  useEffect(() => {
    setOrdersCurrentPage(1)
  }, [search, statusFilter, sortBy, dateFilter])

  if (loading)
    return (
      <div className="page-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    )

  const stats = getStats()

  return (
    <div className="page-container">
      <div className="action-bar">
        <div>
          <h1>Managemen Kendala</h1>
          <p className="subtitle">Pantau dan kelola seluruh kendala ATM dan CRM dalam sistem</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Kendala</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Kendala Dalam Proses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Kendala Sudah Selesai</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.overdue}</div>
          <div className="stat-label">Kendala Dalam Proses Tapi Melewati Deadline</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completed_but_overdue}</div>
          <div className="stat-label">Kendala Sudah Selesai Tapi Melewati Deadline</div>
        </div>
      </div>

      {/* Frequent TIDs Analysis */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3>TID dengan Kendala Berulang (&gt;2 kali dalam 1 bulan)</h3>
        {frequentTids.length === 0 ? (
          <p className="text-muted">Tidak ada TID yang mengalami kendala lebih dari 2 kali dalam satu bulan.</p>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              {currentTids.map((tidData) => {
                const isSelected =
                  selectedTidData &&
                  selectedTidData.tid === tidData.tid &&
                  selectedTidData.monthName === tidData.monthName

                return (
                  <div
                    key={`${tidData.tid}-${tidData.monthKey}`}
                    style={{
                      padding: "1rem",
                      border: `1px solid ${isSelected ? "var(--info)" : "var(--border-primary)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      backgroundColor: isSelected ? "var(--bg-accent)" : "var(--bg-tertiary)",
                    }}
                    onClick={() => {
                      // Toggle behavior: if this TID is already selected, close it; otherwise, open it
                      if (isSelected) {
                        setSelectedTidData(null)
                      } else {
                        const dailyData = generateDailyData(tidData.orders, tidData.monthKey)
                        setSelectedTidData({
                          tid: tidData.tid,
                          monthName: tidData.monthName,
                          dailyData,
                          orders: tidData.orders,
                        })
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--bg-accent)"
                        e.currentTarget.style.borderColor = "var(--info)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"
                        e.currentTarget.style.borderColor = "var(--border-primary)"
                      }
                    }}
                  >
                    <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>TID: {tidData.tid}</div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{tidData.monthName}</div>
                    <div
                      style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--danger)", marginTop: "0.5rem" }}
                    >
                      {tidData.count} kejadian
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      {isSelected ? "Klik untuk tutup grafik" : "Klik untuk lihat grafik"}
                    </div>
                  </div>
                )
              })}
            </div>

            <TidPagination />

            {selectedTidData && (
              <LineChart
                data={selectedTidData.dailyData}
                tid={selectedTidData.tid}
                monthName={selectedTidData.monthName}
                orders={selectedTidData.orders}
              />
            )}
          </div>
        )}
      </div>

      {/* Bulk Upload Section */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3>Bulk Upload Kendala</h3>
        <form onSubmit={handleBulkUpload} style={{ display: "flex", gap: "1rem", alignItems: "end" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Upload File Excel</label>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setBulkFile(e.target.files[0])} />
            <small style={{ color: "#666" }}>Format: TID, Pengelola, Status, Est. Tgl. Problem</small>
          </div>
          <button type="submit" disabled={uploading || !bulkFile}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
      </div>

      {/* Filter Controls - 4 Rows */}
      <div style={{ marginBottom: "1.5rem" }}>
        {/* Row 1: Status Filter */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Filter Status:</label>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="pending">Proses</option>
            <option value="completed">Selesai</option>
            <option value="overdue">Melewati Deadline</option>
            <option value="completed but overdue">Selesai Terlambat</option>
          </select>
        </div>

        {/* Row 2: Date Filter */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Filter Bulan ({currentYear}):
          </label>
          <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">Semua Bulan</option>
            {monthNames.map((month, index) => (
              <option key={index} value={index}>{month} {currentYear}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Sort Options */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Urutkan:</label>
          <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
            <option value="title">Judul A-Z</option>
            <option value="status">Status</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>

        {/* Row 4: Export Button and Search */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            onClick={exportToExcel}
            style={{
              fontSize: "0.875rem",
              padding: "0.5rem 1rem",
              minWidth: "auto",
              width: "auto",
            }}
          >
            Export Excel
          </button>
          <input
            type="text"
            className="search-input"
            placeholder="Cari judul, deskripsi, TID, lokasi, atau pengelola..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>TID</th>
                <th>Lokasi</th>
                <th>KC Supervisi</th>
                <th>Pengelola</th>
                <th>Judul</th>
                <th>Deskripsi</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Hasil Submit</th>
                <th>Diselesaikan</th>
                <th>Deadline</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {currentPageOrders.map((order) => {
                const isOverdue = order.state === "overdue" || isCompletedButOverdue(order.state)
                return (
                  <tr key={order.id} className={isOverdue ? "overdue" : ""}>
                    <td>
                      <strong>#{order.id}</strong>
                    </td>
                    <td>{order.reference_data?.tid || "—"}</td>
                    <td style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {order.reference_data?.lokasi || "—"}
                    </td>
                    <td>{order.reference_data?.kc_supervisi || "—"}</td>
                    <td>{order.username}</td>
                    <td>{order.title}</td>
                    <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {order.description}
                    </td>
                    <td>
                      <span className={`order-status status-${order.state.toLowerCase()}`}>
                        {translateStatus(order.state)}
                      </span>
                    </td>
                    <td className="date-cell">
                      {new Date(order.created_at).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      {order.image_url ? (
                        <a href={order.image_url} target="_blank" rel="noreferrer">
                          Lihat File
                        </a>
                      ) : (
                        <span className="text-muted">Kosong</span>
                      )}
                    </td>
                    <td>
                      {order.completed_at ? (
                        new Date(order.completed_at).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {order.overdue_duration ||
                        (() => {
                          if (order.state === "completed") {
                            const createdAt = new Date(order.created_at)
                            const deadline = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
                            const completedAt = new Date(order.completed_at)
                            return completedAt <= deadline ? "Sesuai deadline" : "Melewati deadline"
                          } else if (order.state === "pending") {
                            const createdAt = new Date(order.created_at)
                            const deadline = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
                            const now = new Date()
                            const diff = deadline - now
                            if (diff > 0) {
                              const hours = Math.floor(diff / (1000 * 60 * 60))
                              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                              return `sisa ${hours} jam ${minutes} menit`
                            } else {
                              const overdueMillis = Math.abs(diff)
                              const hours = Math.floor(overdueMillis / (1000 * 60 * 60))
                              const minutes = Math.floor((overdueMillis % (1000 * 60 * 60)) / (1000 * 60))
                              return `lewat ${hours} jam ${minutes} menit`
                            }
                          } else if (order.state === "overdue") {
                            const createdAt = new Date(order.created_at)
                            const deadline = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
                            const now = new Date()
                            const diff = deadline - now
                            const overdueMillis = Math.abs(diff)
                            const hours = Math.floor(overdueMillis / (1000 * 60 * 60))
                            const minutes = Math.floor((overdueMillis % (1000 * 60 * 60)) / (1000 * 60))
                            return `lewat ${hours} jam ${minutes} menit`
                          }
                          return "—"
                        })()}
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() => deleteOrder(order.id)}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                      >
                        HAPUS
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <OrdersPagination />
      </div>
    </div>
  )
}