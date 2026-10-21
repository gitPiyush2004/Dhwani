import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import DashboardLayout from "@/pages/app/DashboardLayout";
import { AuthGate } from "@/components/app/AuthGate";
import Overview from "@/pages/app/Overview";
import Calls from "@/pages/app/Calls";
import Appointments from "@/pages/app/Appointments";
import Agent from "@/pages/app/Agent";
import Outbound from "@/pages/app/Outbound";
import Settings from "@/pages/app/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/app"
        element={
          <AuthGate>
            <DashboardLayout />
          </AuthGate>
        }
      >
        <Route index element={<Overview />} />
        <Route path="calls" element={<Calls />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="agent" element={<Agent />} />
        <Route path="outbound" element={<Outbound />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
