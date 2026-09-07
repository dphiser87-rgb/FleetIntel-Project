import React, { useEffect, useState } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../lib/theme";
import { startSyncTriggers } from "../lib/sync";

import LoginScreen from "../screens/LoginScreen";
import JobsScreen from "../screens/JobsScreen";
import JobDetailScreen from "../screens/JobDetailScreen";
import RequestPartsScreen from "../screens/RequestPartsScreen";
import VehiclesScreen from "../screens/VehiclesScreen";
import VehicleDetailScreen from "../screens/VehicleDetailScreen";
import InspectionScreen from "../screens/InspectionScreen";
import DefectsScreen from "../screens/DefectsScreen";
import NewDefectScreen from "../screens/NewDefectScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ExecutiveDashboardScreen from "../screens/executive/ExecutiveDashboardScreen";
import VehicleInvestigationScreen from "../screens/executive/VehicleInvestigationScreen";
import CostBreakdownScreen from "../screens/executive/CostBreakdownScreen";
import TransactionDetailScreen from "../screens/executive/TransactionDetailScreen";
import ApprovalsListScreen from "../screens/approvals/ApprovalsListScreen";
import RequisitionApprovalScreen from "../screens/approvals/RequisitionApprovalScreen";
import QuoteApprovalScreen from "../screens/approvals/QuoteApprovalScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Mirrors the backend's actual grant exactly (backend/server.py's _default_permissions()) rather than
// re-deriving it from GET /permissions/presets -- this exact 4-role set is stable/explicit there.
const EXECUTIVE_ROLES = ["admin", "manager", "executive", "finance"];

// Mirrors the backend's REQUISITION_APPROVER_ROLES / OPS_ROLES / FINANCE_ROLES (server.py:2225-2227)
// combined -- any role that can decide at least one of parts requisitions or quote costing stages.
const APPROVER_ROLES = ["workshop_head", "operations_manager", "finance", "admin"];

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function JobsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="JobsList" component={JobsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: "Job" }} />
      <Stack.Screen name="RequestParts" component={RequestPartsScreen} options={{ title: "Request parts" }} />
    </Stack.Navigator>
  );
}

function VehiclesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="VehiclesList" component={VehiclesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ title: "Vehicle" }} />
      <Stack.Screen name="Inspection" component={InspectionScreen} options={{ title: "Inspection" }} />
    </Stack.Navigator>
  );
}

function DefectsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DefectsList" component={DefectsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewDefect" component={NewDefectScreen} options={{ title: "Report defect" }} />
    </Stack.Navigator>
  );
}

function ExecutiveStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ExecutiveDashboard" component={ExecutiveDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VehicleInvestigation" component={VehicleInvestigationScreen} options={{ title: "Vehicle" }} />
      <Stack.Screen name="CostBreakdown" component={CostBreakdownScreen} options={{ title: "Cost breakdown" }} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} options={{ title: "Detail" }} />
    </Stack.Navigator>
  );
}

function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ApprovalsList" component={ApprovalsListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RequisitionApproval" component={RequisitionApprovalScreen} options={{ title: "Parts requisition" }} />
      <Stack.Screen name="QuoteApproval" component={QuoteApprovalScreen} options={{ title: "Quote costing" }} />
    </Stack.Navigator>
  );
}

function useBackgroundSync() {
  useEffect(() => {
    const stop = startSyncTriggers(() => {});
    return stop;
  }, []);
}

function Tabs() {
  useBackgroundSync();
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Jobs" component={JobsStack} options={{ title: "My Jobs" }} />
      <Tab.Screen name="Vehicles" component={VehiclesStack} />
      <Tab.Screen name="Defects" component={DefectsStack} />
      {APPROVER_ROLES.includes(user?.role) && <Tab.Screen name="Approvals" component={ApprovalsStack} />}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function ExecutiveTabs() {
  // Still runs the same background sync (jobs/vehicles/parts/requisitions pull + offline-queue
  // flush) even though this role's screens don't read most of that cache -- the queue flush half
  // matters here too (fuel/trip logs submitted offline from VehicleInvestigationScreen), and there's
  // no separate "executive-only" sync loop worth maintaining just to skip the unused pulls.
  useBackgroundSync();
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="Dashboard" component={ExecutiveStack} />
      {APPROVER_ROLES.includes(user?.role) && <Tab.Screen name="Approvals" component={ApprovalsStack} />}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary },
};

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isExecutive = user && EXECUTIVE_ROLES.includes(user.role);

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? <LoginScreen /> : isExecutive ? <ExecutiveTabs /> : <Tabs />}
    </NavigationContainer>
  );
}
