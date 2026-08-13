import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Fleet from "@/pages/Fleet";
import VehicleDetail from "@/pages/VehicleDetail";
import Templates from "@/pages/Templates";
import TemplateBuilder from "@/pages/TemplateBuilder";
import Inspection from "@/pages/Inspection";
import Maintenance from "@/pages/Maintenance";
import Reports from "@/pages/Reports";
import Parts from "@/pages/Parts";
import InspectionReport from "@/pages/InspectionReport";
import Team from "@/pages/Team";
import AuditLog from "@/pages/AuditLog";
import Security from "@/pages/Security";
import Drivers from "@/pages/Drivers";
import PublicVehicle from "@/pages/PublicVehicle";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="mono text-xs tracking-[0.3em] uppercase text-muted-foreground">Loading FleetCost…</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster theme="dark" position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/public/vehicle/:token" element={<PublicVehicle />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="fleet" element={<Fleet />} />
              <Route path="fleet/:id" element={<VehicleDetail />} />
              <Route path="templates" element={<Templates />} />
              <Route path="templates/new" element={<TemplateBuilder />} />
              <Route path="templates/:id" element={<TemplateBuilder />} />
              <Route path="inspection/:vehicleId" element={<Inspection />} />
              <Route path="inspections/:id" element={<InspectionReport />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="parts" element={<Parts />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="team" element={<Team />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="security" element={<Security />} />
              <Route path="reports" element={<Reports />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
