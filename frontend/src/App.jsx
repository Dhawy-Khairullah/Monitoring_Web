import "./App.css"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { ThemeProvider } from "./context/ThemeContext"
import Login from "./pages/Login"
import AdminDashboard from "./pages/AdminDashboard"
import CreateOrder from "./pages/CreateOrder"
import Navbar from "./components/Navbar"
import UserDashboard from "./pages/UserDashboard"
import SubmitOrder from "./pages/SubmitOrder"

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Navbar />
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/create" element={<CreateOrder />} />
            <Route path="/user" element={<UserDashboard />} />
            <Route path="/user/orders/:orderId/submit" element={<SubmitOrder />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}