import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth";
import FeedbackProvider from "./components/FeedbackProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import VolunteerLayout from "./components/VolunteerLayout";
import AdminLayout from "./components/AdminLayout";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Questionnaire from "./pages/Questionnaire";
import MatchFeed from "./pages/MatchFeed";
import PetDetail from "./pages/PetDetail";
import MyApplications from "./pages/MyApplications";

import Dashboard from "./pages/admin/Dashboard";
import Animals from "./pages/admin/Animals";
import ReviewBoard from "./pages/admin/ReviewBoard";
import Placements from "./pages/admin/Placements";

// "/" and unknown addresses: send people to the right home page
function Home() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={user.role === "admin" ? "/admin" : "/matches"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Foster volunteer pages */}
            <Route element={<ProtectedRoute role="volunteer" />}>
              <Route element={<VolunteerLayout />}>
                <Route path="/questionnaire" element={<Questionnaire />} />
                <Route path="/matches" element={<MatchFeed />} />
                <Route path="/matches/:id" element={<PetDetail />} />
                <Route path="/applications" element={<MyApplications />} />
              </Route>
            </Route>

            {/* Shelter admin pages */}
            <Route element={<ProtectedRoute role="admin" />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="animals" element={<Animals />} />
                <Route path="applications" element={<ReviewBoard />} />
                <Route path="placements" element={<Placements />} />
              </Route>
            </Route>

            <Route path="*" element={<Home />} />
          </Routes>
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
