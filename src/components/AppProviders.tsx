import React from "react";
import { AuthProvider } from "../context/AuthContext";
import { DatabaseProvider } from "../context/DatabaseContext";
import { NotificationProvider } from "../context/NotificationContext";
import { BusinessDayProvider } from "../context/BusinessDayContext";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <DatabaseProvider>
      <NotificationProvider>
        {/* Inside Notification so a state change can raise an alert. */}
        <BusinessDayProvider>{children}</BusinessDayProvider>
      </NotificationProvider>
    </DatabaseProvider>
  </AuthProvider>
);
