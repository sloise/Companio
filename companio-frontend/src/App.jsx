import Messages from "./pages/Messages";
import RouteAnnouncer from "./components/RouteAnnouncer";
import StaffRequests from "./pages/admin/StaffRequests";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import "./polish.css";
import "./experience.css";
import "./playful.css";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth";
import FeedbackProvider from "./components/FeedbackProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import VolunteerLayout from "./components/VolunteerLayout";
import AdminLayout from "./components/AdminLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
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
    return <Landing />;
  }

  return <Navigate to={["admin", "super_admin"].includes(user.role) ? "/admin" : "/matches"} replace />;
}

function App() {
  return (
    <BrowserRouter><RouteAnnouncer/>
      <AuthProvider>
        <FeedbackProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Foster volunteer pages */}
            <Route element={<ProtectedRoute role="volunteer" />}>
              <Route element={<VolunteerLayout />}>
                <Route path="/messages" element={<Messages />} />
                <Route path="/messages/:id" element={<Messages />} />
                <Route path="/profile" element={<Profile />} />
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
                <Route path="messages" element={<Messages />} />
                <Route path="messages/:id" element={<Messages />} />
                <Route element={<ProtectedRoute role="super_admin" />}><Route path="staff-requests" element={<StaffRequests />} /></Route>
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
